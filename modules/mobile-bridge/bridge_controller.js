import { Appointment } from "../appointments/appointment_model.js";
import { OrganizationProfile } from "../organizations/organizations_model.js";
import { joinTokenService } from "../telehealth/telehealth_service.js";
import * as records from "../record-links/record_link_service.js";
import { claimService, resolveLinked, revokeService } from "./mobile_link_service.js";
import { phoneAppointment } from "./mobile_link_logic.js";

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err?.opensAt) return res.status(err.statusCode || 425).json({ success: false, message: err.message, code: err.code, opensAt: err.opensAt });
    next(err);
  }
};
const ipOf = (req) => String(req.body?.ip || "").replace(/[^0-9a-fA-F:.]/g, "").slice(0, 45);

// ---- account link ----
export const claim = wrap(async (req, res) => ok(res, await claimService({ code: req.body?.code, mobileAccountId: req.body?.mobileAccountId })));
export const revoke = wrap(async (req, res) => ok(res, await revokeService({ mobileAccountId: req.body?.mobileAccountId })));

// ---- video visits (A) ----
export const appointments = wrap(async (req, res) => {
  const { webProfileId } = await resolveLinked(req.params.mobileAccountId);
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const rows = await Appointment.find({
    patientId: webProfileId,
    visitType: "virtual",
    status: { $in: ["booked", "checked-in"] },
    scheduledFor: { $gte: since },
  })
    .sort({ scheduledFor: 1 })
    .limit(30)
    .lean();
  const ids = [...new Set(rows.map((r) => String(r.organizationId)))];
  const orgs = ids.length ? await OrganizationProfile.find({ $or: [{ _id: { $in: ids } }, { accountId: { $in: ids } }] }).select("organizationName accountId").lean() : [];
  const names = new Map();
  for (const o of orgs) {
    names.set(String(o._id), o.organizationName);
    names.set(String(o.accountId), o.organizationName);
  }
  ok(res, rows.map((r) => phoneAppointment(r, names.get(String(r.organizationId)))));
});

export const token = wrap(async (req, res) => {
  const { authUser } = await resolveLinked(req.params.mobileAccountId);
  ok(res, await joinTokenService({ appointmentId: req.params.appointmentId, authUser }));
});

// ---- hospital record links (C) ----
const asPatient = async (req) => (await resolveLinked(req.params.mobileAccountId)).authUser;
export const rlInfo = wrap(async (req, res) => {
  await asPatient(req);
  ok(res, await records.getClaimInfo({ token: req.params.token }));
});
export const rlOtp = wrap(async (req, res) => ok(res, await records.sendOtp({ token: req.params.token, authUser: await asPatient(req), ip: ipOf(req) })));
export const rlVerify = wrap(async (req, res) => ok(res, await records.verifyOtp({ token: req.params.token, code: req.body?.code, authUser: await asPatient(req), ip: ipOf(req) })));
export const rlConsent = wrap(async (req, res) =>
  ok(res, await records.recordConsent({ token: req.params.token, authUser: await asPatient(req), version: req.body?.version, scopes: req.body?.scopes, ip: ipOf(req) })),
);
export const rlMine = wrap(async (req, res) => ok(res, await records.myLinks({ authUser: await asPatient(req) })));
export const rlWithdraw = wrap(async (req, res) => ok(res, await records.withdraw({ authUser: await asPatient(req), id: req.params.id, ip: ipOf(req) })));
