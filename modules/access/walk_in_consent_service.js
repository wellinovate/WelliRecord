import crypto from "crypto";
import mongoose from "mongoose";
import { UserProfile } from "../users/user_profile_model.js";
import { OrganizationProfile } from "../organizations/organizations_model.js";
import { PatientOrganization } from "../organizations/patient_organization_model.js";
import { resolveActorContext } from "../vitals/vital_service.js";
import { grantPatientAccess } from "./access_grant_service.js";
import { WalkInConsent } from "./walk_in_consent_model.js";
import { sendSms } from "../../shared/utils/termii.js";
import { AppError } from "../../shared/errors/AppError.js";

const ALLOWED_CATEGORIES = ["lab-results", "medications", "radiology", "allergies", "diagnoses"];
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

const hashCode = (id, code) =>
  crypto.createHash("sha256").update(`${id}:${code}`).digest("hex");

const requireOrgActor = async (authUser) => {
  const actor = await resolveActorContext(authUser);
  if (!actor.isOrganizationActor) {
    throw new AppError("Only facility accounts can do this", 403, "NOT_ORG_ACTOR");
  }
  return actor;
};

export const createWalkInRequest = async ({ authUser, phone, categories }) => {
  const actor = await requireOrgActor(authUser);

  const cats = [...new Set(categories || [])];
  if (!cats.length || cats.length > 4 || cats.some((c) => !ALLOWED_CATEGORIES.includes(c))) {
    throw new AppError("Invalid categories", 400, "INVALID_CATEGORIES");
  }
  const variants = phoneVariants(phone);
  if (!variants.length) throw new AppError("A valid phone number is required", 400, "INVALID_PHONE");

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const orgCount = await WalkInConsent.countDocuments({
    organizationId: actor.organizationId,
    createdAt: { $gte: hourAgo },
  });
  if (orgCount >= ORG_HOURLY_LIMIT) {
    throw new AppError("Too many consent requests. Try again later.", 429, "RATE_LIMITED");
  }

  const patient = await UserProfile.findOne({ phone: { $in: variants } }).lean();
  let sendAllowed = Boolean(patient);
  if (patient) {
    const recent = await WalkInConsent.countDocuments({
      patientId: patient._id,
      createdAt: { $gte: hourAgo },
    });
    if (recent >= PATIENT_HOURLY_LIMIT) sendAllowed = false;
  }

  const doc = new WalkInConsent({
    organizationId: actor.organizationId,
    requestedBy: actor.userId,
    patientId: patient?._id ?? null,
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
        phoneNumber: patient.phone,
        message: `WelliRecord code ${code}: ${name} wants access to your ${cats.join(", ")}. Share it only with staff in front of you. Valid 10 minutes.`,
      });
    } catch (error) {
      console.error("Walk-in consent SMS failed:", error.message);
    }
  }

  // Same response whether or not the number has a WelliRecord.
  return { requestId: doc._id, expiresAt: doc.expiresAt };
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
    reqDoc.patientId &&
    reqDoc.codeHash.length === given.length &&
    crypto.timingSafeEqual(Buffer.from(reqDoc.codeHash), Buffer.from(given));
  if (!ok) throw invalid();

  const claimed = await WalkInConsent.findOneAndUpdate(
    { _id: requestId, usedAt: null },
    { $set: { usedAt: now } },
  );
  if (!claimed) throw invalid();

  const [patient, org] = await Promise.all([
    UserProfile.findById(reqDoc.patientId).lean(),
    OrganizationProfile.findOne({ accountId: actor.organizationId }).lean(),
  ]);
  if (!patient || !org) throw new AppError("Patient or facility not found", 404, "NOT_FOUND");

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

  return { patientId: patient._id, categories: reqDoc.categories, expiresAt: grants[0].expiresAt };
};
