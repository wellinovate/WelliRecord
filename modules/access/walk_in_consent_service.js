import crypto from "crypto";
import mongoose from "mongoose";
import { UserProfile } from "../users/user_profile_model.js";
import { OrganizationProfile } from "../organizations/organizations_model.js";
import { PatientOrganization } from "../organizations/patient_organization_model.js";
import { resolveActorContext } from "../vitals/vital_service.js";
import { grantPatientAccess } from "./access_grant_service.js";
import { WalkInConsent } from "./walk_in_consent_model.js";
import { createAccount } from "../accounts/account_service.js";
import { createUserProfile } from "../users/users_services.js";
import { withTransaction } from "../../shared/utils/withTransaction.js";
import { resolveRegion, UNSPECIFIED_REGION } from "../../shared/utils/nigeriaRegions.js";
import { sendSms } from "../../shared/utils/termii.js";
import { AppError } from "../../shared/errors/AppError.js";

const ALLOWED_CATEGORIES = ["lab-results", "medications", "radiology", "allergies", "diagnoses"];
const GENDERS = ["Male", "Female", "Other"];
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const GRANT_DAYS = 30;
const ORG_HOURLY_LIMIT = 30;
const PATIENT_HOURLY_LIMIT = 5;

const phoneVariants = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 10) return [];
  const last10 = digits.slice(-10);
  return [String(phone).trim(), `0${last10}`, `234${last10}`, `+234${last10}`];
};

const canonicalPhone = (phone) => `0${String(phone).replace(/\D/g, "").slice(-10)}`;

const hashCode = (id, code) =>
  crypto.createHash("sha256").update(`${id}:${code}`).digest("hex");

const requireOrgActor = async (authUser) => {
  const actor = await resolveActorContext(authUser);
  if (!actor.isOrganizationActor) {
    throw new AppError("Only facility accounts can do this", 403, "NOT_ORG_ACTOR");
  }
  return actor;
};

// Validates details for a patient who has no WelliRecord yet. State is compulsory.
const cleanNewPatient = (input) => {
  if (input === undefined || input === null) return null;
  const fullName = String(input.fullName || "").trim().replace(/\s+/g, " ");
  if (fullName.length < 2) {
    throw new AppError("Patient full name is required", 400, "INVALID_FULL_NAME");
  }
  if (!GENDERS.includes(input.gender)) {
    throw new AppError("Gender must be Male, Female or Other", 400, "INVALID_GENDER");
  }

  let dateOfBirth = null;
  if (input.dateOfBirth) {
    const dob = new Date(input.dateOfBirth);
    if (Number.isNaN(dob.getTime()) || dob > new Date()) {
      throw new AppError("Date of birth is not valid", 400, "INVALID_DATE_OF_BIRTH");
    }
    dateOfBirth = dob.toISOString().slice(0, 10);
  }

  const state = String(input.state || "").trim();
  const region = state ? resolveRegion(state) : null;
  const regionCode = typeof region === "string" ? region : region?.code;
  if (!state || !regionCode || regionCode === UNSPECIFIED_REGION.code) {
    throw new AppError("Patient state of residence is required", 400, "STATE_REQUIRED");
  }

  return { fullName, gender: input.gender, dateOfBirth, state };
};

export const createWalkInRequest = async ({ authUser, phone, categories, newPatient }) => {
  const actor = await requireOrgActor(authUser);

  const cats = [...new Set(categories || [])];
  if (!cats.length || cats.length > 4 || cats.some((c) => !ALLOWED_CATEGORIES.includes(c))) {
    throw new AppError("Invalid categories", 400, "INVALID_CATEGORIES");
  }
  const variants = phoneVariants(phone);
  if (!variants.length) throw new AppError("A valid phone number is required", 400, "INVALID_PHONE");

  // Validated whether or not the number has a record, so errors reveal nothing.
  const details = cleanNewPatient(newPatient);

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const orgCount = await WalkInConsent.countDocuments({
    organizationId: actor.organizationId,
    createdAt: { $gte: hourAgo },
  });
  if (orgCount >= ORG_HOURLY_LIMIT) {
    throw new AppError("Too many consent requests. Try again later.", 429, "RATE_LIMITED");
  }

  const patient = await UserProfile.findOne({ phone: { $in: variants } }).lean();
  const targetPhone = patient ? patient.phone : details ? canonicalPhone(phone) : null;

  let sendAllowed = Boolean(targetPhone);
  if (patient) {
    const recent = await WalkInConsent.countDocuments({
      patientId: patient._id,
      createdAt: { $gte: hourAgo },
    });
    if (recent >= PATIENT_HOURLY_LIMIT) sendAllowed = false;
  } else if (details) {
    const recent = await WalkInConsent.countDocuments({
      "newPatient.phone": targetPhone,
      createdAt: { $gte: hourAgo },
    });
    if (recent >= PATIENT_HOURLY_LIMIT) sendAllowed = false;
  }

  const doc = new WalkInConsent({
    organizationId: actor.organizationId,
    requestedBy: actor.userId,
    patientId: patient?._id ?? null,
    newPatient: !patient && details ? { ...details, phone: targetPhone } : null,
    categories: cats,
    codeHash: "pending",
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  const code = String(crypto.randomInt(100000, 1000000));
  doc.codeHash = hashCode(doc._id, code);
  await doc.save();

  if (sendAllowed) {
    try {
      const org = await OrganizationProfile.findOne({ accountId: actor.organizationId }).lean();
      const name = org?.organizationName || org?.name || "A facility";
      await sendSms({
        phoneNumber: targetPhone,
        message: `WelliRecord code ${code}: ${name} wants access to your ${cats.join(", ")}. Share it only with staff in front of you. Valid 10 minutes.`,
      });
    } catch (error) {
      console.error("Walk-in consent SMS failed:", error.message);
    }
  }

  // Same response whether or not the number has a WelliRecord.
  return { requestId: doc._id, expiresAt: doc.expiresAt };
};

// Creates an unclaimed patient. The placeholder email and random password
// mean nobody can log in until the patient claims the record.
const registerShellPatient = async (details) => {
  return withTransaction(async (session) => {
    const account = await createAccount(
      {
        accountType: "user",
        role: "patient",
        email: `walkin-${crypto.randomUUID()}@walkin.invalid`,
        password: crypto.randomBytes(24).toString("hex"),
        phone: details.phone,
        status: "pending",
        isVerified: false,
      },
      session,
    );

    const [firstName, ...rest] = details.fullName.split(" ");
    const profile = await createUserProfile(
      {
        accountId: account._id,
        fullName: details.fullName,
        firstName,
        lastName: rest.join(" "),
        email: account.email,
        phone: details.phone,
        gender: details.gender,
        registrationState: details.state,
      },
      session,
    );

    if (details.dateOfBirth) {
      await UserProfile.updateOne(
        { _id: profile._id },
        { $set: { dateOfBirth: details.dateOfBirth } },
        { session },
      );
    }
    return profile;
  });
};

export const confirmWalkInRequest = async ({ authUser, requestId, code }) => {
  const actor = await requireOrgActor(authUser);
  const invalid = () => new AppError("Invalid or expired code", 400, "INVALID_CODE");

  if (!mongoose.isValidObjectId(requestId) || !/^\d{6}$/.test(String(code || ""))) throw invalid();

  const now = new Date();
  const reqDoc = await WalkInConsent.findOneAndUpdate(
    {
      _id: requestId,
      organizationId: actor.organizationId,
      usedAt: null,
      expiresAt: { $gt: now },
      attempts: { $lt: MAX_ATTEMPTS },
    },
    { $inc: { attempts: 1 } },
    { new: true },
  );

  const given = hashCode(requestId, code);
  const ok =
    reqDoc &&
    (reqDoc.patientId || reqDoc.newPatient) &&
    reqDoc.codeHash.length === given.length &&
    crypto.timingSafeEqual(Buffer.from(reqDoc.codeHash), Buffer.from(given));
  if (!ok) throw invalid();

  const claimed = await WalkInConsent.findOneAndUpdate(
    { _id: requestId, usedAt: null },
    { $set: { usedAt: now } },
  );
  if (!claimed) throw invalid();

  const org = await OrganizationProfile.findOne({ accountId: actor.organizationId }).lean();
  if (!org) throw new AppError("Patient or facility not found", 404, "NOT_FOUND");

  let patient = null;
  let isNewPatient = false;
  if (reqDoc.patientId) {
    patient = await UserProfile.findById(reqDoc.patientId).lean();
  } else {
    // Someone may have registered with this number since the request was made.
    patient = await UserProfile.findOne({
      phone: { $in: phoneVariants(reqDoc.newPatient.phone) },
    }).lean();
    if (!patient) {
      patient = (await registerShellPatient(reqDoc.newPatient)).toObject();
      isNewPatient = true;
    }
  }
  if (!patient) throw new AppError("Patient or facility not found", 404, "NOT_FOUND");

  const grants = [];
  for (const category of reqDoc.categories) {
    const grant = await grantPatientAccess({
      patientId: patient._id,
      grantedBy: patient.accountId,
      granteeOrganizationId: org._id,
      granteeType: "organization",
      accessScope: "category",
      category,
      durationDays: GRANT_DAYS,
      permissions: { view: true, write: true },
      purpose: "Walk-in consent confirmed by one-time code",
    });
    if (!grant) throw new AppError("Could not record consent", 500, "GRANT_FAILED");
    grants.push(grant);
  }

  await PatientOrganization.findOneAndUpdate(
    { patientId: patient._id, organizationId: actor.organizationId },
    {
      $setOnInsert: { relationshipType: "registered", firstSeenAt: now, createdBy: actor.userId },
      $set: { status: "active", lastSeenAt: now },
    },
    { upsert: true },
  );

  return {
    patientId: patient._id,
    ...(isNewPatient ? { newPatient: true, wrId: patient.wrId } : {}),
    categories: reqDoc.categories,
    expiresAt: grants[0].expiresAt,
  };
};
