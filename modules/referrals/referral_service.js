import mongoose from "mongoose";
import { Referral } from "./referral_model.js";
import { UserProfile } from "../users/user_profile_model.js";
import { OrganizationProfile } from "../organizations/organizations_model.js";
import { getMyOrganizationService } from "../organizations/verification_services.js";
import { AppError } from "../../shared/errors/AppError.js";

const resolveActingOrg = async (authUser) => {
  const profile = await getMyOrganizationService({
    accountId: authUser.sub,
    profileId: authUser.profileId,
  });
  return profile;
};

const URGENCY_VALUES = ["routine", "urgent", "emergency"];

export const createReferralService = async ({
  authUser,
  patientId,
  receivingOrganizationId,
  specialty,
  urgency,
  reason,
  clinicalSummary,
}) => {
  if (!mongoose.isValidObjectId(patientId)) {
    throw new AppError("Invalid patientId", 400, "INVALID_PATIENT_ID");
  }
  if (!mongoose.isValidObjectId(receivingOrganizationId)) {
    throw new AppError("Invalid receivingOrganizationId", 400, "INVALID_ORG_ID");
  }
  if (!reason?.trim()) {
    throw new AppError("Reason is required", 400, "MISSING_REASON");
  }
  if (urgency && !URGENCY_VALUES.includes(urgency)) {
    throw new AppError("Invalid urgency", 400, "INVALID_URGENCY");
  }

  const [patient, receivingOrg, referringOrg] = await Promise.all([
    UserProfile.findById(patientId).select("fullName").lean(),
    OrganizationProfile.findById(receivingOrganizationId).select("organizationName").lean(),
    resolveActingOrg(authUser),
  ]);

  if (!patient) throw new AppError("Patient not found", 404, "PATIENT_NOT_FOUND");
  if (!receivingOrg) throw new AppError("Receiving organization not found", 404, "ORG_NOT_FOUND");

  if (String(referringOrg._id) === String(receivingOrg._id)) {
    throw new AppError(
      "You can't refer a patient to your own organization",
      400,
      "SELF_REFERRAL",
    );
  }

  const referral = await Referral.create({
    patientId,
    patientName: patient.fullName,
    referringOrganizationId: referringOrg._id,
    referringOrganizationName: referringOrg.organizationName,
    referringProviderAccountId: authUser.sub,
    referringProviderName: authUser.fullName || "Unknown",
    receivingOrganizationId: receivingOrg._id,
    receivingOrganizationName: receivingOrg.organizationName,
    specialty: specialty?.trim() || null,
    urgency: urgency || "routine",
    reason: reason.trim(),
    clinicalSummary: clinicalSummary?.trim() || null,
  });

  return referral;
};

export const listSentReferralsService = async ({ authUser, status }) => {
  const org = await resolveActingOrg(authUser);
  const query = { referringOrganizationId: org._id };
  if (status) query.status = status;
  return Referral.find(query).sort({ createdAt: -1 }).lean();
};

export const listReceivedReferralsService = async ({ authUser, status }) => {
  const org = await resolveActingOrg(authUser);
  const query = { receivingOrganizationId: org._id };
  if (status) query.status = status;
  return Referral.find(query).sort({ createdAt: -1 }).lean();
};

const assertInvolved = (referral, orgId) => {
  const isSender = String(referral.referringOrganizationId) === String(orgId);
  const isReceiver = String(referral.receivingOrganizationId) === String(orgId);
  if (!isSender && !isReceiver) {
    throw new AppError("Referral not found", 404, "REFERRAL_NOT_FOUND");
  }
  return { isSender, isReceiver };
};

export const getReferralByIdService = async ({ authUser, referralId }) => {
  if (!mongoose.isValidObjectId(referralId)) {
    throw new AppError("Referral not found", 404, "REFERRAL_NOT_FOUND");
  }
  const referral = await Referral.findById(referralId);
  if (!referral) throw new AppError("Referral not found", 404, "REFERRAL_NOT_FOUND");

  const org = await resolveActingOrg(authUser);
  assertInvolved(referral, org._id);

  return referral;
};

// Valid transitions, keyed by who's allowed to make them:
//   receiver: pending -> accepted | declined ; accepted -> completed
//   sender:   pending -> cancelled
const RECEIVER_TRANSITIONS = {
  pending: ["accepted", "declined"],
  accepted: ["completed"],
};
const SENDER_TRANSITIONS = {
  pending: ["cancelled"],
};

export const updateReferralStatusService = async ({
  authUser,
  referralId,
  status,
  responseNote,
}) => {
  const VALID_STATUSES = ["accepted", "declined", "completed", "cancelled"];
  if (!VALID_STATUSES.includes(status)) {
    throw new AppError("Invalid status", 400, "INVALID_STATUS");
  }

  const referral = await Referral.findById(referralId);
  if (!referral) throw new AppError("Referral not found", 404, "REFERRAL_NOT_FOUND");

  const org = await resolveActingOrg(authUser);
  const { isSender, isReceiver } = assertInvolved(referral, org._id);

  const allowedByReceiver = isReceiver && RECEIVER_TRANSITIONS[referral.status]?.includes(status);
  const allowedBySender = isSender && SENDER_TRANSITIONS[referral.status]?.includes(status);

  if (!allowedByReceiver && !allowedBySender) {
    throw new AppError(
      `Can't move a ${referral.status} referral to ${status} from this side`,
      400,
      "INVALID_TRANSITION",
    );
  }

  referral.status = status;
  referral.responseNote = responseNote?.trim() || null;
  referral.respondedAt = new Date();
  referral.respondedByAccountId = authUser.sub;
  referral.respondedByName = authUser.fullName || "Unknown";

  await referral.save();
  return referral;
};
