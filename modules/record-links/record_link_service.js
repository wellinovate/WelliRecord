import mongoose from "mongoose";
import { AppError } from "../../shared/errors/AppError.js";
import { escapeRegexInput } from "../../shared/utils/escapeRegexInput.js";
import { sendSms } from "../../shared/utils/termii.js";
import { LocalCustomer } from "../local-customers/local_customer_model.js";
import { OrganizationProfile } from "../organizations/organizations_model.js";
import { PatientOrganization } from "../organizations/patient_organization_model.js";
import { UserProfile } from "../users/user_profile_model.js";
import { allergyModel } from "../allergies/allergies_model.js";
import { medicationModel } from "../medications/medications_model.js";
import { createNotification } from "../notifications/notification_services.js";
import { RecordLink, RecordLinkAudit } from "./record_link_model.js";
import {
  CONSENT_SCOPES,
  CONSENT_VERSION,
  LINK_TTL_MS,
  OTP_TTL_MS,
  afterWrongOtp,
  canMove,
  canSendOtp,
  cleanConsent,
  cleanStagedItems,
  hashOtp,
  hashSecret,
  identityCheck,
  isOpen,
  itemsInScope,
  linkExpired,
  maskPhone,
  newOtp,
  newToken,
  otpLocked,
  safeEqual,
  validOtpFormat,
} from "./record_link_logic.js";

const KEY = () => {
  const k = process.env.RECORD_LINK_KEY || process.env.JWT_SECRET_KEY;
  if (!k) throw new AppError("Record linking is not configured", 503, "RECORD_LINK_NOT_CONFIGURED");
  return k;
};
const frontendUrl = () => (process.env.FRONTEND_URL || "https://www.wellirecord.com").replace(/\/$/, "");
const oid = (v) => (mongoose.isValidObjectId(v) ? new mongoose.Types.ObjectId(String(v)) : null);
const fail = (msg, status = 400, code = "BAD_REQUEST") => {
  throw new AppError(msg, status, code);
};

function maskIp(ip) {
  const s = String(ip || "").replace(/^::ffff:/, "");
  if (s.includes(":")) return s.split(":").slice(0, 3).join(":") + ":…";
  const p = s.split(".");
  return p.length === 4 ? `${p[0]}.${p[1]}.${p[2]}.x` : s.slice(0, 40);
}

async function audit(link, action, actor, detail = "", ip = "") {
  try {
    await RecordLinkAudit.create({
      linkId: link._id,
      organizationId: link.organizationId,
      action,
      actorType: actor.type,
      actorId: actor.id || "",
      detail: String(detail).slice(0, 400),
      ip: maskIp(ip),
    });
  } catch (err) {
    console.warn("[record-link audit] could not write:", err.message);
  }
}

const staffActor = (authUser) => ({ type: "staff", id: String(authUser?.sub || "") });
const patientActor = (authUser) => ({ type: "patient", id: String(authUser?.sub || "") });
const label = (a) => (a.type === "system" ? "system" : `${a.type}:${a.id}`);

/** Moves the status only if it is still what the caller read, so two requests cannot both win. */
async function move(link, to, actor, note = "", set = {}) {
  if (!canMove(link.status, to)) fail(`This link cannot move from ${link.status} to ${to}.`, 409, "BAD_TRANSITION");
  const updated = await RecordLink.findOneAndUpdate(
    { _id: link._id, status: link.status },
    { $set: { status: to, ...set }, $push: { statusHistory: { status: to, by: label(actor), note: String(note).slice(0, 300) } } },
    { new: true },
  );
  if (!updated) fail("This link was changed by someone else. Reload and try again.", 409, "CONFLICT");
  return updated;
}

async function tell(link, title, body) {
  if (!link.claimantAccountId) return;
  try {
    await createNotification({ recipientAccountId: link.claimantAccountId, type: "system", title, body });
  } catch (err) {
    console.warn("[record-link notify] failed:", err.message);
  }
}

async function orgOf(authUser) {
  const org = authUser?.wrOrgId ? await OrganizationProfile.findOne({ wrOrgId: authUser.wrOrgId }) : null;
  if (!org) fail("This account is not linked to an organization.", 403, "NO_ORGANIZATION");
  return org;
}

async function ownLink(id, authUser) {
  const org = await orgOf(authUser);
  const _id = oid(id);
  const link = _id ? await RecordLink.findOne({ _id, organizationId: org._id }) : null;
  if (!link) fail("Link not found.", 404, "NOT_FOUND");
  return { link, org };
}

const byToken = async (token) => {
  const link = typeof token === "string" && token.length >= 20 ? await RecordLink.findOne({ tokenHash: hashSecret(token, KEY()) }) : null;
  if (!link) fail("This link is not valid.", 404, "LINK_NOT_FOUND");
  return link;
};

const summary = (l) => ({
  id: String(l._id),
  localCustomerId: String(l.localCustomerId),
  status: l.status,
  actionReason: l.actionReason || "",
  createdAt: l.createdAt,
  expiresAt: l.expiresAt,
  verifiedAt: l.verifiedAt,
  verifiedMethod: l.verifiedMethod,
  verificationWeak: l.verificationWeak,
  consentAt: l.consentAt,
  consentVersion: l.consentVersion,
  consentScopes: l.consentScopes,
  releasedAt: l.releasedAt,
  stagedCount: (l.staged || []).length,
  transferred: l.transferred,
  transferredAt: l.transferredAt,
  history: l.statusHistory,
});

// ----- hospital staff -----

export async function initiateLink({ authUser, localCustomerId, ip }) {
  const org = await orgOf(authUser);
  const cid = oid(localCustomerId);
  const customer = cid ? await LocalCustomer.findOne({ _id: cid, organizationId: org._id }) : null;
  if (!customer) fail("Patient record not found.", 404, "NOT_FOUND");
  if (customer.invitationStatus === "linked" && customer.welliRecordUserId) fail("This patient is already linked.", 409, "ALREADY_LINKED");
  if (!customer.phone) fail("This record has no phone number. Add the patient's phone in the hospital record first.", 400, "NO_PHONE");

  const token = newToken();
  let link;
  try {
    link = await RecordLink.create({
      organizationId: org._id,
      localCustomerId: customer._id,
      status: "awaiting_patient_verification",
      statusHistory: [{ status: "awaiting_patient_verification", by: label(staffActor(authUser)), note: "Link created" }],
      initiatedBy: oid(authUser.sub),
      tokenHash: hashSecret(token, KEY()),
      expiresAt: new Date(Date.now() + LINK_TTL_MS),
    });
  } catch (err) {
    if (err?.code === 11000) fail("A link for this patient is already open.", 409, "ALREADY_OPEN");
    throw err;
  }
  await audit(link, "initiated", staffActor(authUser), `Customer ${customer._id}`, ip);
  return { link: summary(link), token, url: `${frontendUrl()}/link/${token}`, phoneHint: maskPhone(customer.phone) };
}

export async function listLinks({ authUser, status, page = 1, limit = 20 }) {
  const org = await orgOf(authUser);
  const q = { organizationId: org._id };
  if (status) q.status = String(status);
  const [rows, total] = await Promise.all([
    RecordLink.find(q).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).select("-staged.data -tokenHash -otpHash").lean(),
    RecordLink.countDocuments(q),
  ]);
  const customers = await LocalCustomer.find({ _id: { $in: rows.map((r) => r.localCustomerId) } }).select("fullName firstName lastName externalId").lean();
  const byId = new Map(customers.map((c) => [String(c._id), c]));
  return {
    total,
    links: rows.map((r) => {
      const c = byId.get(String(r.localCustomerId));
      return { ...summary(r), patientName: c?.fullName || [c?.firstName, c?.lastName].filter(Boolean).join(" "), externalId: c?.externalId || null };
    }),
  };
}

export async function getLink({ authUser, id }) {
  const { link } = await ownLink(id, authUser);
  const audit_ = await RecordLinkAudit.find({ linkId: link._id }).sort({ at: -1 }).limit(100).lean();
  return { link: summary(link), audit: audit_ };
}

export async function stageItems({ authUser, id, items, ip }) {
  const { link } = await ownLink(id, authUser);
  if (!["awaiting_patient_verification", "awaiting_consent", "under_hospital_review", "action_required"].includes(link.status)) {
    fail("Items can no longer be added to this link.", 409, "NOT_STAGEABLE");
  }
  const clean = cleanStagedItems(items, (link.staged || []).length);
  if (clean.error) fail(clean.error, 400, "BAD_ITEMS");
  await RecordLink.updateOne(
    { _id: link._id, status: link.status },
    { $push: { staged: { $each: clean.items.map((i) => ({ ...i, stagedBy: oid(authUser.sub) })) } } },
  );
  await audit(link, "items_staged", staffActor(authUser), `${clean.items.length} item(s)`, ip);
  return { added: clean.items.length };
}

export async function rejectLink({ authUser, id, reason, ip }) {
  const { link } = await ownLink(id, authUser);
  const why = String(reason || "").trim().slice(0, 300);
  if (!why) fail("Give a reason.", 400, "REASON_REQUIRED");
  const updated = await move(link, "action_required", staffActor(authUser), why, { actionReason: why });
  await audit(updated, "rejected", staffActor(authUser), why, ip);
  await tell(updated, "Your hospital record needs attention", "The hospital could not finish linking your record. Contact them to continue.");
  return summary(updated);
}

/** Staff sends a stuck link back to the patient for another try. */
export async function reopenLink({ authUser, id, ip }) {
  const { link } = await ownLink(id, authUser);
  if (link.status !== "action_required") fail("Only a link that needs action can be reopened.", 409, "BAD_TRANSITION");
  const to = link.patientProfileId && link.consentAt ? "under_hospital_review" : "awaiting_patient_verification";
  const updated = await move(link, to, staffActor(authUser), "Reopened", {
    actionReason: "",
    otpAttempts: 0,
    otpLifetimeFails: 0,
    otpLockedUntil: null,
    otpHash: null,
    expiresAt: new Date(Date.now() + LINK_TTL_MS),
  });
  await audit(updated, "reopened", staffActor(authUser), to, ip);
  return summary(updated);
}

export async function cancelLink({ authUser, id, ip }) {
  const { link } = await ownLink(id, authUser);
  if (!isOpen(link.status)) fail("This link is already closed.", 409, "BAD_TRANSITION");
  if (link.status === "linking_in_progress") fail("A transfer is under way. Try again in a minute.", 409, "BUSY");
  const updated = await move(link, "cancelled", staffActor(authUser), "Cancelled by the hospital", { staged: [], otpHash: null });
  await audit(updated, "cancelled", staffActor(authUser), "", ip);
  await tell(updated, "Record linking cancelled", "The hospital cancelled linking your record.");
  return summary(updated);
}

/** The hospital's release authorization. Only now does staged data reach the patient's record. */
export async function approveLink({ authUser, id, note, ip }) {
  const { link, org } = await ownLink(id, authUser);
  if (link.status !== "under_hospital_review") fail("This link is not waiting for review.", 409, "BAD_TRANSITION");
  if (!link.patientProfileId || !link.consentAt || !link.consentScopes.includes("demographics")) fail("The patient has not verified and consented yet.", 409, "NOT_READY");
  if (linkExpired(link)) fail("This link has expired. Reopen it first.", 410, "EXPIRED");

  const actor = staffActor(authUser);
  const moving = await move(link, "linking_in_progress", actor, note || "Released by the hospital", {
    releasedBy: oid(authUser.sub),
    releasedAt: new Date(),
    releaseNote: String(note || "").slice(0, 300),
  });
  await audit(moving, "released", actor, String(note || ""), ip);

  const counts = { allergies: 0, medications: 0, skipped: 0, failed: 0 };
  const failed = [];
  const toSend = itemsInScope(moving.staged, moving.consentScopes);
  const notInScope = (moving.staged || []).length - toSend.length;
  const orgName = org.organizationName || "the hospital";

  for (const item of toSend) {
    try {
      const base = {
        patientId: moving.patientProfileId,
        recordedBy: oid(authUser.sub),
        organizationId: moving.organizationId,
        source: "imported",
        createdContext: "imported",
        notes: `Imported from ${orgName}${item.sourceRef ? `, reference ${item.sourceRef}` : ""}. Not yet confirmed by a clinician in WelliRecord.`,
      };
      if (item.kind === "allergy") {
        const dup = await allergyModel.findOne({
          patientId: moving.patientProfileId,
          allergen: new RegExp(`^${escapeRegexInput(item.data.allergen)}$`, "i"),
          allergyType: item.data.allergyType,
          recordStatus: "active",
        });
        if (dup) {
          counts.skipped += 1;
          continue;
        }
        await allergyModel.create({ ...base, ...item.data, verificationStatus: "unverified" });
        counts.allergies += 1;
      } else {
        const dup = await medicationModel.findOne({
          patientId: moving.patientProfileId,
          medicationName: new RegExp(`^${escapeRegexInput(item.data.medicationName)}$`, "i"),
          recordStatus: "active",
        });
        if (dup) {
          counts.skipped += 1;
          continue;
        }
        const dosageText = item.data.dosage ? ` Dosage as recorded: ${item.data.dosage}.` : "";
        await medicationModel.create({
          ...base,
          medicationName: item.data.medicationName,
          frequency: item.data.frequency || undefined,
          notes: `${base.notes}${dosageText}${item.data.notes ? ` ${item.data.notes}` : ""}`.slice(0, 1500),
        });
        counts.medications += 1;
      }
    } catch (err) {
      counts.failed += 1;
      failed.push(item);
      console.warn("[record-link transfer] item failed:", err.message);
    }
  }

  if (counts.failed > 0) {
    const stuck = await RecordLink.findOneAndUpdate(
      { _id: moving._id, status: "linking_in_progress" },
      {
        $set: { status: "action_required", actionReason: `${counts.failed} item(s) could not be transferred. Review and approve again.`, transferred: counts, staged: failed },
        $push: { statusHistory: { status: "action_required", by: "system", note: "Partial transfer" } },
      },
      { new: true },
    );
    await audit(moving, "transfer_partial", { type: "system" }, JSON.stringify(counts), ip);
    return summary(stuck);
  }

  // Link the hospital patient to the account.
  const customer = await LocalCustomer.findById(moving.localCustomerId);
  if (customer) {
    customer.welliRecordUserId = moving.patientProfileId;
    customer.matchStatus = "matched";
    customer.matchConfidence = 100;
    customer.invitationStatus = "linked";
    customer.invitationToken = null;
    customer.matchCandidates = [];
    await customer.save();
  }
  try {
    await PatientOrganization.findOneAndUpdate(
      { patientId: moving.patientProfileId, organizationId: moving.organizationId },
      { patientId: moving.patientProfileId, organizationId: moving.organizationId, relationshipType: "registered", status: "active", externalPatientId: customer?.externalId || null, lastSeenAt: new Date() },
      { upsert: true, new: true },
    );
  } catch (err) {
    console.warn("[record-link] PatientOrganization upsert warning:", err.message);
  }

  const done = await RecordLink.findOneAndUpdate(
    { _id: moving._id, status: "linking_in_progress" },
    {
      $set: { status: "linked", transferred: { ...counts, skipped: counts.skipped + notInScope }, transferredAt: new Date(), staged: [], actionReason: "" },
      $push: { statusHistory: { status: "linked", by: "system", note: JSON.stringify(counts) } },
    },
    { new: true },
  );
  await audit(done, "linked", { type: "system" }, JSON.stringify(counts), ip);
  const n = counts.allergies + counts.medications;
  await tell(done, "Your hospital record is linked", n ? `${orgName} linked your record and added ${n} item(s). Review them in your health vault.` : `${orgName} linked your record.`);
  return summary(done);
}

// ----- the patient -----

export async function getClaimInfo({ token }) {
  const link = await byToken(token);
  const customer = await LocalCustomer.findById(link.localCustomerId).select("firstName fullName").lean();
  const org = await OrganizationProfile.findById(link.organizationId).select("organizationName").lean();
  const first = customer?.firstName || String(customer?.fullName || "").split(/\s+/)[0] || "";
  return {
    organization: org?.organizationName || "Your hospital",
    firstName: first,
    status: linkExpired(link) && isOpen(link.status) ? "expired" : link.status,
    consentVersion: CONSENT_VERSION,
    scopes: CONSENT_SCOPES,
  };
}

function assertPatient(authUser) {
  if (!authUser?.sub || authUser.accountType === "organization" || authUser.wrOrgId) fail("Sign in with your patient account to continue.", 403, "PATIENT_ONLY");
}

function assertUsable(link) {
  if (!isOpen(link.status)) fail("This link is no longer active.", 410, "CLOSED");
  if (linkExpired(link)) fail("This link has expired. Ask the hospital for a new one.", 410, "EXPIRED");
}

export async function sendOtp({ token, authUser, ip }) {
  assertPatient(authUser);
  const link = await byToken(token);
  assertUsable(link);
  if (link.status !== "awaiting_patient_verification") fail("This step is already done or needs the hospital.", 409, "BAD_STATE");
  const can = canSendOtp(link);
  if (!can.ok) {
    throw Object.assign(new AppError(can.reason === "locked" ? "Too many wrong codes. Try again later." : "Too many codes requested. Try again later.", 429, "RATE_LIMITED"), { retryAt: can.retryAt });
  }
  const customer = await LocalCustomer.findById(link.localCustomerId).select("phone");
  if (!customer?.phone) fail("The hospital has no phone number for this record.", 409, "NO_PHONE");

  const code = newOtp();
  await RecordLink.updateOne(
    { _id: link._id },
    {
      $set: { otpHash: hashOtp(code, link._id, KEY()), otpExpiresAt: new Date(Date.now() + OTP_TTL_MS), otpAttempts: 0 },
      $push: { otpSendTimes: { $each: [new Date()], $slice: -10 } },
    },
  );
  try {
    await sendSms({ phoneNumber: customer.phone, message: `Your WelliRecord code to link your hospital record is ${code}. It expires in 10 minutes. Do not share it.` });
  } catch (err) {
    console.warn("[record-link otp] SMS failed:", err.message);
    fail("We could not send the code. Try again in a few minutes.", 502, "SMS_FAILED");
  }
  await audit(link, "otp_sent", patientActor(authUser), "To the hospital-held number", ip);
  return { sentTo: maskPhone(customer.phone), expiresInMinutes: OTP_TTL_MS / 60000 };
}

export async function verifyOtp({ token, code, authUser, ip }) {
  assertPatient(authUser);
  const link = await byToken(token);
  assertUsable(link);
  if (link.status !== "awaiting_patient_verification") fail("This step is already done or needs the hospital.", 409, "BAD_STATE");
  if (otpLocked(link)) fail("Too many wrong codes. Try again later.", 429, "RATE_LIMITED");
  if (!validOtpFormat(code)) fail("Enter the 6-digit code.", 400, "BAD_CODE_FORMAT");
  if (!link.otpHash || !link.otpExpiresAt || link.otpExpiresAt.getTime() < Date.now()) fail("The code has expired. Ask for a new one.", 410, "OTP_EXPIRED");

  if (!safeEqual(link.otpHash, hashOtp(code, link._id, KEY()))) {
    const w = afterWrongOtp({ attempts: link.otpAttempts, lifetimeFails: link.otpLifetimeFails });
    await RecordLink.updateOne({ _id: link._id }, { $set: { otpAttempts: w.attempts, otpLifetimeFails: w.lifetimeFails, otpLockedUntil: w.lockedUntil } });
    await audit(link, "otp_failed", patientActor(authUser), "", ip);
    if (w.escalate) {
      const esc = await move(link, "action_required", { type: "system" }, "Too many wrong codes", { actionReason: "Too many wrong codes were entered. Confirm who is using this link." });
      await audit(esc, "escalated", { type: "system" }, "Lifetime wrong codes", ip);
    }
    fail("That code is not right.", 400, "OTP_WRONG");
  }

  // The code proves the person can read the hospital's number. Now check they are the patient.
  const profile = await UserProfile.findOne({ accountId: authUser.sub }).select("fullName dateOfBirth").lean();
  const customer = await LocalCustomer.findById(link.localCustomerId).select("fullName firstName lastName dob welliRecordUserId").lean();
  const flag = async (reason) => {
    const upd = await move(link, "action_required", { type: "system" }, reason, { actionReason: reason, claimantAccountId: oid(authUser.sub), otpHash: null });
    await audit(upd, "verification_failed", patientActor(authUser), reason, ip);
    fail("We could not confirm that this record belongs to you. The hospital has been asked to check.", 409, "VERIFICATION_FAILED");
  };
  if (!profile) return flag("The signed-in account has no profile.");
  if (customer?.welliRecordUserId && String(customer.welliRecordUserId) !== String(profile._id)) return flag("This hospital record is already linked to a different account.");
  const check = identityCheck({ hospital: customer || {}, claimant: { fullName: profile.fullName, dob: profile.dateOfBirth } });
  if (!check.ok) return flag(`Identity check failed: ${check.reason}.`);

  const upd = await move(link, "awaiting_consent", patientActor(authUser), `Verified by ${check.method}`, {
    patientProfileId: profile._id,
    claimantAccountId: oid(authUser.sub),
    verifiedAt: new Date(),
    verifiedMethod: check.method,
    verificationWeak: check.weak,
    otpHash: null,
    otpAttempts: 0,
  });
  await audit(upd, "verified", patientActor(authUser), `method ${check.method}${check.weak ? " (weak)" : ""}`, ip);
  await tell(upd, "Identity confirmed", "Next, choose what to link from your hospital record.");
  return { status: upd.status };
}

export async function recordConsent({ token, authUser, version, scopes, ip }) {
  assertPatient(authUser);
  const link = await byToken(token);
  assertUsable(link);
  if (link.status !== "awaiting_consent") fail("Verify your identity first.", 409, "BAD_STATE");
  if (String(link.claimantAccountId) !== String(authUser.sub)) fail("This link was verified by a different account.", 403, "WRONG_ACCOUNT");
  const c = cleanConsent({ version, scopes });
  if (c.error) fail(c.error, 400, "BAD_CONSENT");
  const upd = await move(link, "under_hospital_review", patientActor(authUser), "Consent given", { consentAt: new Date(), consentVersion: CONSENT_VERSION, consentScopes: c.scopes });
  await audit(upd, "consent_given", patientActor(authUser), c.scopes.join(","), ip);
  await tell(upd, "Waiting for the hospital", "Your consent is recorded. The hospital will review and release your record.");
  return { status: upd.status };
}

export async function myLinks({ authUser }) {
  assertPatient(authUser);
  const rows = await RecordLink.find({ claimantAccountId: oid(authUser.sub) }).sort({ updatedAt: -1 }).limit(20).select("-staged -tokenHash -otpHash").lean();
  const orgs = await OrganizationProfile.find({ _id: { $in: rows.map((r) => r.organizationId) } }).select("organizationName").lean();
  const names = new Map(orgs.map((o) => [String(o._id), o.organizationName]));
  return rows.map((r) => ({ id: String(r._id), organization: names.get(String(r.organizationId)) || "", status: r.status, consentAt: r.consentAt, consentScopes: r.consentScopes, transferred: r.transferred, updatedAt: r.updatedAt }));
}

/** The patient can withdraw until the transfer starts. */
export async function withdraw({ authUser, id, ip }) {
  assertPatient(authUser);
  const _id = oid(id);
  const link = _id ? await RecordLink.findOne({ _id, claimantAccountId: oid(authUser.sub) }) : null;
  if (!link) fail("Link not found.", 404, "NOT_FOUND");
  if (!isOpen(link.status) || link.status === "linking_in_progress") fail("This link can no longer be withdrawn.", 409, "BAD_TRANSITION");
  const upd = await move(link, "cancelled", patientActor(authUser), "Withdrawn by the patient", { staged: [] });
  await audit(upd, "withdrawn", patientActor(authUser), "", ip);
  return { status: upd.status };
}
