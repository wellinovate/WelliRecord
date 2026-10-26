import { assertProviderEligible } from "../provider-verification/web_gate.js";
import mongoose from "mongoose";
import { AppError } from "../../shared/errors/AppError.js";
import { OrganizationProfile } from "../organizations/organizations_model.js";
import { callMobile } from "../mobile-bridge/mobile_client.js";
import { canManage, canWork, facilityIdOf, orgGate, relayStatus, serviceBody } from "./mobile_booking_logic.js";

async function orgOf(authUser) {
  if (!authUser?.sub) return null;
  if (authUser.accountType === "organization") {
    if (mongoose.isValidObjectId(authUser.organizationId)) {
      const p = await OrganizationProfile.findById(authUser.organizationId);
      if (p) return p;
    }
    return authUser.wrOrgId ? OrganizationProfile.findOne({ wrOrgId: authUser.wrOrgId }) : null;
  }
  return mongoose.isValidObjectId(authUser.organizationId) ? OrganizationProfile.findOne({ accountId: authUser.organizationId }) : null;
}

async function context(authUser, { manage = false } = {}) {
  if (!(manage ? canManage(authUser) : canWork(authUser))) {
    throw new AppError(manage ? "Only the organization owner can change this." : "You do not have access to app bookings.", 403, "FORBIDDEN");
  }
  const profile = await orgOf(authUser);
  const gate = orgGate(profile);
  if (!gate.ok) throw new AppError(gate.message, gate.status, gate.code);
  return { profile, facilityId: facilityIdOf(profile) };
}

const unwrap = (r) => {
  if (r.ok) return r.data;
  const e = relayStatus(r);
  throw new AppError(e.message, e.status, r.code || "MOBILE_ERROR");
};
const idOk = (id) => {
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(String(id))) throw new AppError("Unknown visit.", 400, "INVALID_ID");
  return String(id);
};
const base = (facilityId) => `/api/v1/bridge/providers/${encodeURIComponent(facilityId)}`;

export const getServiceService = async ({ authUser }) => {
  const { profile, facilityId } = await context(authUser);
  const service = unwrap(await callMobile("GET", `${base(facilityId)}/service`));
  return { organization: { name: profile.organizationName, facilityId }, service, canManage: canManage(authUser) };
};

export const saveServiceService = async ({ authUser, body }) => {
  const { profile, facilityId } = await context(authUser, { manage: true });
  return unwrap(await callMobile("PUT", `${base(facilityId)}/service`, serviceBody(profile, body || {}, authUser.fullName)));
};

export const listVisitsService = async ({ authUser }) => {
  const { facilityId } = await context(authUser);
  return unwrap(await callMobile("GET", `${base(facilityId)}/visits`));
};

export const visitActionService = async ({ authUser, id, action, body }) => {
  const manage = action === "hmo";
  const { facilityId } = await context(authUser, { manage });
  const vid = idOk(id);
  if (action === "confirm" || action === "cancel") return unwrap(await callMobile("POST", `${base(facilityId)}/visits/${vid}/${action}`, {}));
  if (action === "hmo") {
    const decision = body?.decision;
    if (decision !== "approve" && decision !== "decline") throw new AppError("Choose approve or decline.", 400, "BAD_DECISION");
    return unwrap(await callMobile("POST", `${base(facilityId)}/visits/${vid}/hmo`, { decision, approvalCode: String(body?.approvalCode || "").slice(0, 60), decidedBy: authUser.fullName || "" }));
  }
  if (action === "video-token") {
    await assertProviderEligible(authUser, "start_consultation", { facilityId });
    const r = unwrap(await callMobile("POST", `${base(facilityId)}/visits/${vid}/video-token`, { who: { id: String(authUser.sub), name: authUser.fullName || "" } }));
    return { url: r.url, token: r.token, room: r.room };
  }
  throw new AppError("Unknown action.", 400, "BAD_ACTION");
};
