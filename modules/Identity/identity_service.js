import crypto from "crypto";
import bcrypt from "bcryptjs";
import { Identity } from "./identity.model.js";
import { Account } from "../accounts/account.model.js";

/**
 * Get or create identity + return computed view model
 */
export const fetchIdentity = async (accountId) => {
  let identity = await Identity.findOne({ accountId });

  if (!identity) {
    identity = await Identity.create({
      accountId,
      verifications: [],
    });
  }

  const email = identity.verifications.find(v => v.type === "email");
  const phone = identity.verifications.find(v => v.type === "phone");

  const emailVerified = email?.status === "verified";
  const phoneVerified = phone?.status === "verified";

  const verificationLevel =
    emailVerified && phoneVerified ? "trusted" : "basic";

  return {
    emailVerified,
    phoneVerified,
    verificationLevel,
    trustScore: identity.trustScore,
  };
};

/**
 * Send Email OTP
 */
export const sendEmailOtp = async (accountId) => {
  const account = await Account.findById(accountId);

  if (!account) {
    throw new Error("Account not found");
  }

  let identity = await Identity.findOne({ accountId });

  if (!identity) {
    identity = await Identity.create({ accountId, verifications: [] });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const hashedOtp = await bcrypt.hash(otp, 10);

  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  const index = identity.verifications.findIndex(
    v => v.type === "email"
  );

  const verificationObject = {
    type: "email",
    value: account.email,
    status: "pending",
    verificationCodeHash: hashedOtp,
    expiresAt,
    attempts: 0,
    lastSentAt: new Date(),
  };

  if (index >= 0) {
    identity.verifications[index] = {
      ...identity.verifications[index],
      ...verificationObject,
    };
  } else {
    identity.verifications.push(verificationObject);
  }

  await identity.save();

  // TODO: Replace with real email service (SendGrid / SES / Resend)
  console.log("EMAIL OTP:", otp);

  return {
    sent: true,
    expiresAt,
  };
};

/**
 * Verify Email OTP
 */
export const verifyEmailOtp = async (accountId, otp) => {
  const identity = await Identity.findOne({ accountId });

  if (!identity) {
    throw new Error("Identity not found");
  }

  const emailVerification = identity.verifications.find(
    v => v.type === "email"
  );

  if (!emailVerification) {
    throw new Error("Email verification not found");
  }

  if (emailVerification.expiresAt < new Date()) {
    emailVerification.status = "expired";
    await identity.save();
    throw new Error("OTP expired");
  }

  const isValid = await bcrypt.compare(
    otp,
    emailVerification.verificationCodeHash
  );

  if (!isValid) {
    emailVerification.attempts += 1;

    if (emailVerification.attempts >= 5) {
      emailVerification.status = "failed";
    }

    await identity.save();
    throw new Error("Invalid OTP");
  }

  emailVerification.status = "verified";
  emailVerification.verifiedAt = new Date();
  emailVerification.verificationCodeHash = null;

  // trust upgrade (simple MVP logic)
  identity.trustScore += 10;

  await identity.save();

  return {
    verified: true,
  };
};