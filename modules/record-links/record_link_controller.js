import * as svc from "./record_link_service.js";

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err?.retryAt) res.set("Retry-After", String(Math.max(1, Math.ceil((new Date(err.retryAt) - Date.now()) / 1000))));
    next(err);
  }
};
const ip = (req) => req.ip || "";

// staff
export const initiate = wrap(async (req, res) => ok(res, await svc.initiateLink({ authUser: req.user, localCustomerId: req.body?.localCustomerId, ip: ip(req) }), 201));
export const list = wrap(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  ok(res, await svc.listLinks({ authUser: req.user, status: req.query.status, page, limit }));
});
export const detail = wrap(async (req, res) => ok(res, await svc.getLink({ authUser: req.user, id: req.params.id })));
export const stage = wrap(async (req, res) => ok(res, await svc.stageItems({ authUser: req.user, id: req.params.id, items: req.body?.items, ip: ip(req) })));
export const approve = wrap(async (req, res) => ok(res, await svc.approveLink({ authUser: req.user, id: req.params.id, note: req.body?.note, ip: ip(req) })));
export const reject = wrap(async (req, res) => ok(res, await svc.rejectLink({ authUser: req.user, id: req.params.id, reason: req.body?.reason, ip: ip(req) })));
export const reopen = wrap(async (req, res) => ok(res, await svc.reopenLink({ authUser: req.user, id: req.params.id, ip: ip(req) })));
export const cancel = wrap(async (req, res) => ok(res, await svc.cancelLink({ authUser: req.user, id: req.params.id, ip: ip(req) })));

// patient
export const claimInfo = wrap(async (req, res) => ok(res, await svc.getClaimInfo({ token: req.params.token })));
export const otpSend = wrap(async (req, res) => ok(res, await svc.sendOtp({ token: req.params.token, authUser: req.user, ip: ip(req) })));
export const otpVerify = wrap(async (req, res) => ok(res, await svc.verifyOtp({ token: req.params.token, code: req.body?.code, authUser: req.user, ip: ip(req) })));
export const consent = wrap(async (req, res) => ok(res, await svc.recordConsent({ token: req.params.token, authUser: req.user, version: req.body?.version, scopes: req.body?.scopes, ip: ip(req) })));
export const mine = wrap(async (req, res) => ok(res, await svc.myLinks({ authUser: req.user })));
export const withdraw = wrap(async (req, res) => ok(res, await svc.withdraw({ authUser: req.user, id: req.params.id, ip: ip(req) })));
