import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import crypto from "node:crypto";
import { OrganizationMembership } from "../../modules/memberships/organization_membership_model.js";

import dotenv from "dotenv";
dotenv.config();
export const signAccessToken = async (results) => {
  const { account, profile } = results;

  if (!account?._id && !account?.id) {
    throw new Error("Cannot sign token without account id");
  }

  const payload = {
    sub: String(account._id || account.id),
    email: account.email,
    isVerified: account.isVerified,
    fullName: profile.fullName,
    accountType: account.accountType,
    wrId: profile?.wrId,
    role: account.role,
    profileId: profile?._id
      ? String(profile._id)
      : profile?.id
      ? String(profile.id)
      : null,
  };

  if (account.accountType === "organization") {
    payload.organizationId = profile?._id
      ? String(profile._id)
      : profile?.id
      ? String(profile.id)
      : null;
    payload.wrOrgId = profile.wrOrgId;
    payload.fullName = profile.organizationName;
  } else if (payload.profileId) {
    // BUGFIX: organizationId was only ever set on the org owner's
    // token (accountType === "organization"). Staff accounts are
    // accountType "user", identical to a patient, so their tokens
    // never carried organizationId at all. shared/realtime/socket.js
    // reads socket.data.user.organizationId to join each connection
    // to `org:${organizationId}` — with it missing, every staff
    // member's socket joined no room, so io.to(`org:${organizationId}`)
    // broadcasts (lab_order_service.js, pharmacy_order_service.js)
    // never reached them, only the org owner. Same underlying gap
    // resolveActorContext (shared/vitals/vital_service.js) already
    // works around per-request for REST; this resolves it once at
    // login instead, via the same OrganizationMembership lookup, so
    // it doesn't have to be re-derived on every socket/API call.
    const membership = await OrganizationMembership.findOne({
      userId: payload.profileId,
      isActive: true,
    })
      .select("organizationId membershipRole")
      .lean();

    if (membership) {
      payload.organizationId = String(membership.organizationId);
      // Account.role only distinguishes provider_admin/doctor/nurse from
      // everyone else — ACCOUNT_ROLE_MAP (team_services.js) collapses
      // clinician, frontdesk, pharmacist, lab_tech, telehealth_provider,
      // insurer_agent, and support_staff all down to the generic "staff"
      // at the Account level, since Account.role's enum is coarser than
      // membershipRole's. Using `role` alone for frontend role-gating
      // (ProviderLayout.tsx's hasAccess check) meant every one of those
      // roles failed every role-specific nav item — only provider_admin/
      // doctor/nurse ever worked. membershipRole is the actual granular
      // job function; carry it so the frontend can prefer it.
      payload.membershipRole = membership.membershipRole || null;
    }
  }

  return jwt.sign(payload, process.env.JWT_SECRET_KEY, {
    expiresIn: "1d",
    issuer: "wellirecord-api",
    audience: "wellirecord-client",
  });
};

export const signAccessTokenGoogle = async (user) => {
  return signAccessToken({
    account: {
      _id: user.accountId,
      id: user.accountId,
      email: user.email,
      isVerified: true,
      accountType: user.accountType || "user",
      role: user.role || "patient",
    },
    profile: user,
  });
};

export const normalizeEmail = (email) => {
  return String(email || "")
    .trim()
    .toLowerCase();
};

export const normalizePhone = (phone) => {
  if (!phone) return "";

  let value = String(phone).trim().replace(/\s+/g, "");

  if (value.startsWith("0")) {
    value = `+234${value.slice(1)}`;
  } else if (value.startsWith("234")) {
    value = `+${value}`;
  }

  return value;
};

export const maskEmail = (email) => {
  if (!email) return null;

  const [local, domain] = email.split("@");
  if (!domain) return null;

  const visible = local.slice(0, 2);
  return `${visible}***@${domain}`;
};

// export const maskPhone = (phone) => {
//   if (!phone) return null;

//   const cleaned = String(phone);
//   if (cleaned.length < 7) return "******";

//   return `${cleaned.slice(0, 6)}*****${cleaned.slice(-3)}`;
// };

export const generateLoginChallengeToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

export const hashLoginChallengeToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

export const getLoginOtpExpiry = () => {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 5);
  return expiresAt;
};

export const maskPhone = (phone = "") => {
  if (phone.length < 6) return phone;
  return `${phone.slice(0, 4)}****${phone.slice(-3)}`;
};

// utils/generateEncounterCode.js

export const generateEncounterCode = async (EncounterModel) => {
  const today = new Date();

  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  const dateStr = `${year}${month}${day}`;

  // count today's encounters
  const startOfDay = new Date(year, today.getMonth(), today.getDate());
  const endOfDay = new Date(year, today.getMonth(), today.getDate() + 1);

  const count = await EncounterModel.countDocuments({
    createdAt: {
      $gte: startOfDay,
      $lt: endOfDay,
    },
  });

  const sequence = String(count + 1).padStart(4, "0");

  return `ENC-${dateStr}-${sequence}`;
};

export const generateWelliRecordId = () => {
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  const timestamp = Date.now().toString().slice(-4);
  return `WR-${timestamp}-${random}`;
};

export const mailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false, // true only for 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const generateEmailVerificationToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

export const hashVerificationToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

export const getVerificationTokenExpiry = () => {
  return new Date(Date.now() + 1000 * 60 * 30); // 30 minutes
};
