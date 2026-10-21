import { AppError } from "../../shared/errors/AppError.js";
import { Account } from "../accounts/account_model.js";
import { UserProfile } from "../users/user_profile_model.js";
import { MobileLink } from "./mobile_link_model.js";
import { callMobile } from "./mobile_client.js";
import { CODE_TTL_MS, cleanMobileId, hashCode, newLinkCode, normalizeCode, validCode } from "./mobile_link_logic.js";

const secret = () => process.env.JWT_SECRET_KEY || "";

async function assertPatientAccount(authUser) {
  if (!authUser?.sub || authUser.accountType !== "user" || authUser.practiceOf) {
    throw new AppError("Use your patient account to link the mobile app.", 403, "PATIENT_ACCOUNT_REQUIRED");
  }
  const account = await Account.findById(authUser.sub).select("isActive status managedBy practiceOf").lean();
  if (!account || !account.isActive || account.status !== "active" || account.managedBy || account.practiceOf) {
    throw new AppError("This account cannot be linked.", 403, "ACCOUNT_NOT_ELIGIBLE");
  }
  const profile = await UserProfile.findOne({ accountId: authUser.sub }).select("_id fullName").lean();
  if (!profile) throw new AppError("User profile not found", 404, "USER_PROFILE_NOT_FOUND");
  return profile;
}

export async function createLinkCodeService({ authUser }) {
  if (!secret()) throw new AppError("Linking is not switched on.", 503, "NOT_CONFIGURED");
  const profile = await assertPatientAccount(authUser);
  const existing = await MobileLink.findOne({ accountId: authUser.sub });
  if (existing?.mobileAccountId) throw new AppError("Your account is already linked to the mobile app.", 409, "ALREADY_LINKED");
  const code = newLinkCode();
  const codeExpiresAt = new Date(Date.now() + CODE_TTL_MS);
  await MobileLink.findOneAndUpdate(
    { accountId: authUser.sub },
    { $set: { profileId: profile._id, codeHash: hashCode(code, secret()), codeExpiresAt } },
    { upsert: true },
  );
  return { code, expiresAt: codeExpiresAt };
}

export async function linkStatusService({ authUser }) {
  const l = await MobileLink.findOne({ accountId: authUser.sub }).select("mobileAccountId linkedAt").lean();
  return { linked: Boolean(l?.mobileAccountId), linkedAt: l?.linkedAt || null };
}

/** The website side ends the link, and tells the mobile backend to forget it. */
export async function unlinkService({ authUser }) {
  const l = await MobileLink.findOne({ accountId: authUser.sub });
  if (!l) return { linked: false };
  const mobileId = l.mobileAccountId;
  await MobileLink.deleteOne({ _id: l._id });
  if (mobileId) await callMobile("POST", "/api/v1/bridge/web-link/revoke", { mobileAccountId: mobileId }).catch(() => null);
  return { linked: false };
}

// ---- called by the mobile backend ----

export async function claimService({ code, mobileAccountId }) {
  const mid = cleanMobileId(mobileAccountId);
  if (!mid || !validCode(code)) throw new AppError("That code is not valid. Check it and try again.", 400, "BAD_CODE");
  const l = await MobileLink.findOneAndUpdate(
    { codeHash: hashCode(code, secret()), codeExpiresAt: { $gt: new Date() }, mobileAccountId: null },
    { $set: { mobileAccountId: mid, linkedAt: new Date() }, $unset: { codeHash: 1, codeExpiresAt: 1 } },
    { new: true },
  ).catch((e) => {
    if (e?.code === 11000) throw new AppError("This phone account is already linked to a website account.", 409, "MOBILE_ALREADY_LINKED");
    throw e;
  });
  if (!l) throw new AppError("That code is not valid or has expired. Make a new one on the website.", 400, "BAD_CODE");
  const profile = await UserProfile.findById(l.profileId).select("fullName").lean();
  return { webAccountId: String(l.accountId), webProfileId: String(l.profileId), fullName: profile?.fullName || "" };
}

export async function revokeService({ mobileAccountId }) {
  const mid = cleanMobileId(mobileAccountId);
  if (mid) await MobileLink.deleteOne({ mobileAccountId: mid });
  return { linked: false };
}

/** The website patient behind a mobile account, or a 404 the phone shows as "link your account". */
export async function resolveLinked(mobileAccountId) {
  const mid = cleanMobileId(mobileAccountId);
  const l = mid ? await MobileLink.findOne({ mobileAccountId: mid }).lean() : null;
  if (!l) throw new AppError("This phone is not linked to a website account.", 404, "NOT_LINKED");
  const account = await Account.findById(l.accountId).select("isActive status").lean();
  if (!account || !account.isActive || account.status !== "active") throw new AppError("The linked website account is not active.", 403, "ACCOUNT_INACTIVE");
  const profile = await UserProfile.findById(l.profileId).select("fullName").lean();
  return {
    webAccountId: String(l.accountId),
    webProfileId: String(l.profileId),
    authUser: { sub: String(l.accountId), accountType: "user", profileId: String(l.profileId), fullName: profile?.fullName || "" },
  };
}
