import crypto from "crypto";
import { AppError } from "../../shared/errors/AppError.js";
import { withTransaction } from "../../shared/utils/withTransaction.js";
import { generateWelliRecordId } from "../../shared/utils/helper.js";
import { geocodeAddress } from "../../shared/utils/googleMaps.js";
import { sendNewProviderSignupNotificationEmail } from "../../shared/utils/resend.js";
import { Account } from "../accounts/account_model.js";
import { UserProfile } from "../users/user_profile_model.js";
import { OrganizationProfile } from "../organizations/organizations_model.js";
import { cleanPractitionerInput, needsReverification, practiceDisplayName } from "./practitioner_logic.js";

const PROFILE_FIELDS =
  "_id organizationName organizationType profession specialty licenseNumber licenseBody yearsExperience bio officeAddress phone email wrOrgId logo verificationStatus verificationDecisionNote verificationDocumentName updatedAt";

const summary = (p) =>
  p && {
    id: String(p._id),
    wrOrgId: p.wrOrgId || null,
    practiceName: p.organizationName,
    profession: p.profession || null,
    specialty: p.specialty || "",
    licenseNumber: p.licenseNumber || "",
    licenseBody: p.licenseBody || "",
    yearsExperience: p.yearsExperience ?? null,
    bio: p.bio || "",
    officeAddress: p.officeAddress || "",
    contactPhone: p.phone || "",
    contactEmail: p.email || "",
    logo: p.logo || null,
    verificationStatus: p.verificationStatus,
    verificationNote: p.verificationDecisionNote || "",
  };

/** The patient Account id behind a token, whether it is the patient token or the practice token. */
const patientAccountIdOf = (authUser) => String(authUser?.practiceOf || authUser?.sub || "");

async function findPractice(authUser) {
  const patientId = patientAccountIdOf(authUser);
  if (!patientId) return null;
  const account = await Account.findOne({ practiceOf: patientId });
  if (!account) return null;
  const profile = await OrganizationProfile.findOne({ accountId: account._id }).lean();
  return profile ? { account, profile } : null;
}

function assertRealPatient(authUser) {
  if (!authUser?.sub || authUser.accountType !== "user" || authUser.practiceOf) {
    throw new AppError("Sign in to your patient account to become a provider.", 403, "PATIENT_ACCOUNT_REQUIRED");
  }
}

export const becomePractitionerService = async ({ authUser, body }) => {
  assertRealPatient(authUser);
  const cleaned = cleanPractitionerInput(body);
  if (!cleaned.ok) {
    throw new AppError("Check the highlighted fields.", 400, "VALIDATION_FAILED", cleaned.errors);
  }
  const v = cleaned.value;

  const patient = await Account.findById(authUser.sub);
  if (!patient || !patient.isActive || patient.status !== "active" || patient.managedBy || patient.practiceOf) {
    throw new AppError("This account cannot register as a provider.", 403, "ACCOUNT_NOT_ELIGIBLE");
  }
  if (!patient.isVerified) {
    throw new AppError("Verify your email before registering as a provider.", 403, "EMAIL_NOT_VERIFIED");
  }
  const userProfile = await UserProfile.findOne({ accountId: patient._id }).lean();
  if (!userProfile) throw new AppError("User profile not found", 404, "USER_PROFILE_NOT_FOUND");

  const location = v.officeAddress ? await geocodeAddress(v.officeAddress).catch(() => null) : null;

  const result = await withTransaction(async (session) => {
    const existing = await Account.findOne({ practiceOf: patient._id }).session(session);
    if (existing) throw new AppError("You are already registered as a provider.", 409, "ALREADY_PRACTITIONER");

    const [account] = await Account.create(
      [
        {
          accountType: "organization",
          role: "provider_admin",
          // Never given to anyone and never used to sign in; see Account.practiceOf.
          email: `practice.${crypto.randomBytes(12).toString("hex")}@internal.wellirecord.com`,
          password: crypto.randomBytes(24).toString("hex"),
          status: "active",
          isActive: true,
          isVerified: true,
          practiceOf: patient._id,
        },
      ],
      { session },
    );

    const [profile] = await OrganizationProfile.create(
      [
        {
          accountId: account._id,
          wrOrgId: generateWelliRecordId(),
          organizationName: practiceDisplayName({ practiceName: v.practiceName, fullName: userProfile.fullName, profession: v.profession }),
          organizationType: "individaul_provider",
          profession: v.profession,
          specialty: v.specialty || null,
          licenseNumber: v.licenseNumber,
          licenseBody: v.licenseBody,
          yearsExperience: v.yearsExperience ?? null,
          bio: v.bio || null,
          officeAddress: v.officeAddress || null,
          contactPersonName: userProfile.fullName,
          contactPersonRole: v.profession,
          phone: v.contactPhone || patient.phone || null,
          email: patient.email,
          ...(location && { location, geocodedAt: new Date() }),
        },
      ],
      { session },
    );
    return { profile };
  });

  sendNewProviderSignupNotificationEmail({
    organizationName: result.profile.organizationName,
    organizationType: "individaul_provider",
    contactPersonName: userProfile.fullName,
    contactPersonRole: v.profession,
    email: patient.email,
    phone: v.contactPhone || patient.phone,
    registrationNumber: null,
    licenseNumber: v.licenseNumber,
  }).catch((err) => console.error("Practitioner signup notification failed:", err));

  return summary(result.profile);
};

export const getPractitionerStatusService = async ({ authUser }) => {
  const found = await findPractice(authUser);
  return { isPractitioner: Boolean(found), profile: found ? summary(found.profile) : null, inPracticeView: Boolean(authUser?.practiceOf) };
};

export const updatePractitionerService = async ({ authUser, body }) => {
  const found = await findPractice(authUser);
  if (!found) throw new AppError("You are not registered as a provider.", 404, "NOT_PRACTITIONER");
  const cleaned = cleanPractitionerInput(body, { partial: true });
  if (!cleaned.ok) throw new AppError("Check the highlighted fields.", 400, "VALIDATION_FAILED", cleaned.errors);
  const v = cleaned.value;
  const set = {};
  if (v.profession !== undefined) set.profession = v.profession;
  if (v.licenseNumber !== undefined) set.licenseNumber = v.licenseNumber;
  if (v.licenseBody !== undefined) set.licenseBody = v.licenseBody;
  if (v.specialty !== undefined) set.specialty = v.specialty || null;
  if (v.bio !== undefined) set.bio = v.bio || null;
  if (v.yearsExperience !== undefined) set.yearsExperience = v.yearsExperience;
  if (v.contactPhone !== undefined) set.phone = v.contactPhone || null;
  if (v.practiceName) set.organizationName = v.practiceName;
  if (v.officeAddress !== undefined) {
    set.officeAddress = v.officeAddress || null;
    const location = v.officeAddress ? await geocodeAddress(v.officeAddress).catch(() => null) : null;
    if (location) {
      set.location = location;
      set.geocodedAt = new Date();
    }
  }
  let reverify = false;
  if (needsReverification(found.profile, v)) {
    reverify = true;
    set.verificationStatus = found.profile.verificationDocumentUrl ? "pending" : "not_submitted";
    set.verificationDecisionNote = "Your licence details changed. They are checked again before you can see patients.";
  }
  const updated = await OrganizationProfile.findByIdAndUpdate(found.profile._id, { $set: set }, { new: true, select: PROFILE_FIELDS }).lean();
  return { profile: summary(updated), reverify };
};

/**
 * The person signs in once as a patient. This gives the token for the other side of the same person:
 * to "provider" their practice account, to "patient" their own account.
 */
export const switchContextService = async ({ authUser, to }) => {
  if (to === "provider") {
    assertRealPatient(authUser);
    const found = await findPractice(authUser);
    if (!found) throw new AppError("You are not registered as a provider.", 404, "NOT_PRACTITIONER");
    if (!found.account.isActive || found.account.status !== "active") {
      throw new AppError("Your provider account is not active.", 403, "ACCOUNT_INACTIVE");
    }
    return { account: found.account, profile: found.profile };
  }
  if (to === "patient") {
    if (!authUser?.practiceOf) throw new AppError("You are already in your patient account.", 400, "ALREADY_PATIENT");
    const account = await Account.findById(authUser.practiceOf);
    if (!account || !account.isActive || account.status !== "active") {
      throw new AppError("Your patient account is not active.", 403, "ACCOUNT_INACTIVE");
    }
    const profile = await UserProfile.findOne({ accountId: account._id }).select("_id fullName email phone avatar gender wrId isVerified").lean();
    if (!profile) throw new AppError("User profile not found", 404, "USER_PROFILE_NOT_FOUND");
    return { account, profile };
  }
  throw new AppError("Choose provider or patient.", 400, "INVALID_CONTEXT");
};
