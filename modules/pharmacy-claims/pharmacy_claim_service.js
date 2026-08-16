import mongoose from "mongoose";
import { PharmacyClaim, CLAIM_STATUSES } from "./pharmacy_claim_model.js";
import { pharmacyOrderModel } from "../pharmacy-orders/pharmacy_order_model.js";
import { UserProfile } from "../users/user_profile_model.js";
import { getMyOrganizationService } from "../organizations/verification_services.js";
import { AppError } from "../../shared/errors/AppError.js";

const isValidObjectId = (v) => mongoose.Types.ObjectId.isValid(v);

const resolveActingOrg = async (authUser) =>
  getMyOrganizationService({ accountId: authUser?.sub, profileId: authUser?.profileId });

export const createClaimService = async ({
  authUser,
  patientId,
  orderIds,
  hmoName,
  hmoMemberId,
  claimAmount,
  notes,
}) => {
  if (!isValidObjectId(patientId)) {
    throw new AppError("Invalid patientId", 400, "INVALID_PATIENT_ID");
  }
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    throw new AppError("At least one dispensed order is required", 400, "MISSING_ORDERS");
  }
  if (orderIds.some((id) => !isValidObjectId(id))) {
    throw new AppError("Invalid order id in orderIds", 400, "INVALID_ORDER_ID");
  }
  if (!hmoName?.trim()) {
    throw new AppError("HMO name is required", 400, "MISSING_HMO_NAME");
  }
  const amount = Number(claimAmount);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new AppError("A valid claim amount is required", 400, "INVALID_AMOUNT");
  }

  const org = await resolveActingOrg(authUser);

  const [patient, orders] = await Promise.all([
    UserProfile.findById(patientId).select("fullName").lean(),
    pharmacyOrderModel.find({ _id: { $in: orderIds } }).select("patientId organizationId").lean(),
  ]);

  if (!patient) throw new AppError("Patient not found", 404, "PATIENT_NOT_FOUND");

  if (orders.length !== orderIds.length) {
    throw new AppError("One or more orders could not be found", 404, "ORDER_NOT_FOUND");
  }

  // Every order in the claim must belong to this pharmacy and to the
  // same patient the claim is being filed for — otherwise a claim
  // could be used to reference another facility's dispensing record,
  // or bundle a different patient's medication into someone else's claim.
  const invalid = orders.find(
    (o) =>
      String(o.organizationId) !== String(org._id) ||
      String(o.patientId) !== String(patientId),
  );
  if (invalid) {
    throw new AppError(
      "All orders in a claim must belong to this pharmacy and the same patient",
      400,
      "ORDER_MISMATCH",
    );
  }

  const claim = await PharmacyClaim.create({
    organizationId: org._id,
    patientId,
    patientName: patient.fullName,
    orderIds,
    hmoName: hmoName.trim(),
    hmoMemberId: hmoMemberId?.trim() || null,
    claimAmount: amount,
    notes: notes?.trim() || null,
    recordedByAccountId: authUser.sub,
    recordedByName: authUser.fullName || "Unknown",
  });

  return claim;
};

export const listClaimsService = async ({ authUser, status }) => {
  const org = await resolveActingOrg(authUser);
  const query = { organizationId: org._id };
  if (status) query.status = status;
  return PharmacyClaim.find(query).sort({ createdAt: -1 }).lean();
};

export const getClaimSummaryService = async ({ authUser }) => {
  const org = await resolveActingOrg(authUser);

  const rows = await PharmacyClaim.aggregate([
    { $match: { organizationId: org._id } },
    { $group: { _id: "$status", total: { $sum: "$claimAmount" }, count: { $sum: 1 } } },
  ]);

  const byStatus = Object.fromEntries(
    CLAIM_STATUSES.map((s) => [s, { total: 0, count: 0 }]),
  );
  for (const row of rows) {
    byStatus[row._id] = { total: row.total, count: row.count };
  }

  // Outstanding = claimed but not yet paid and not rejected — money
  // the pharmacy is still owed.
  const outstanding = byStatus.submitted.total + byStatus.approved.total;

  return { byStatus, outstanding };
};

const assertClaimOwnership = async (claim, authUser) => {
  const org = await resolveActingOrg(authUser);
  if (String(claim.organizationId) !== String(org._id)) {
    throw new AppError("Claim not found", 404, "CLAIM_NOT_FOUND");
  }
  return org;
};

export const getClaimByIdService = async ({ authUser, claimId }) => {
  if (!isValidObjectId(claimId)) throw new AppError("Claim not found", 404, "CLAIM_NOT_FOUND");
  const claim = await PharmacyClaim.findById(claimId);
  if (!claim) throw new AppError("Claim not found", 404, "CLAIM_NOT_FOUND");
  await assertClaimOwnership(claim, authUser);
  return claim;
};

// submitted -> approved | rejected
// approved  -> paid
// rejected, paid are terminal
const ALLOWED_TRANSITIONS = {
  submitted: ["approved", "rejected"],
  approved: ["paid", "rejected"],
};

export const updateClaimStatusService = async ({
  authUser,
  claimId,
  status,
  claimReference,
  rejectionReason,
  notes,
}) => {
  if (!CLAIM_STATUSES.includes(status)) {
    throw new AppError("Invalid status", 400, "INVALID_STATUS");
  }

  const claim = await PharmacyClaim.findById(claimId);
  if (!claim) throw new AppError("Claim not found", 404, "CLAIM_NOT_FOUND");
  await assertClaimOwnership(claim, authUser);

  if (!ALLOWED_TRANSITIONS[claim.status]?.includes(status)) {
    throw new AppError(
      `Can't move a ${claim.status} claim to ${status}`,
      400,
      "INVALID_TRANSITION",
    );
  }

  if (status === "rejected" && !rejectionReason?.trim()) {
    throw new AppError("A rejection reason is required", 400, "MISSING_REJECTION_REASON");
  }

  claim.status = status;
  if (status === "approved" || status === "rejected") {
    claim.decisionAt = new Date();
  }
  if (status === "paid") {
    claim.paidAt = new Date();
  }
  if (status === "rejected") {
    claim.rejectionReason = rejectionReason.trim();
  }
  if (claimReference !== undefined) claim.claimReference = claimReference?.trim() || null;
  if (notes !== undefined) claim.notes = notes?.trim() || null;

  await claim.save();
  return claim;
};
