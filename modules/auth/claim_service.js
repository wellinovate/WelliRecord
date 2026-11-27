import crypto from "crypto";
import mongoose from "mongoose";
import { Account } from "../accounts/account_model.js";
import { UserProfile } from "../users/user_profile_model.js";
import { ClaimChallenge } from "./claim_challenge_model.js";
import { sendSms } from "../../shared/utils/termii.js";
import { withTransaction } from "../../shared/utils/withTransaction.js";
import { AppError } from "../../shared/errors/AppError.js";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const HOURLY_LIMIT = 5;
const SHELL_DOMAIN = "@walkin.invalid";
const WELLI_ID = /^WR-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const phoneVariants = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 10) return [];
  const last10 = digits.slice(-10);
  return [String(phone).trim(), `0${last10}`, `234${last10}`, `+234${last10}`];
};

const hashCode = (id, code) =>
  crypto.createHash("sha256").update(`${id}:${code}`).digest("hex");

// An unclaimed record is a walk-in registration nobody has logged into yet.
const isUnclaimed = (account) =>
  Boolean(account) &&
  account.status === "pending" &&
  account.isVerified !== true &&
  String(account.email || "").endsWith(SHELL_DOMAIN);

const findProfile = async (identifier) => {
  const value = String(identifier || "").trim();
  if (!value) return null;
  const asId = value.toUpperCase();
  if (WELLI_ID.test(asId)) return UserProfile.findOne({ wrId: asId }).lean();
  const variants = phoneVariants(value);
  if (!variants.length) return null;
  return UserProfile.findOne({ phone: { $in: variants } }).lean();
};

export const requestClaim = async ({ identifier }) => {
  if (!String(identifier || "").trim()) {
    throw new AppError("WelliID or phone number is required", 400, "IDENTIFIER_REQUIRED");
  }

  // Same response whether or not a claimable record exists.
  const decoy = {
    requestId: new mongoose.Types.ObjectId(),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  };

  const profile = await findProfile(identifier);
  if (!profile) return decoy;
  const account = await Account.findById(profile.accountId)
    .select("email status isVerified")
    .lean();
  if (!isUnclaimed(account)) return decoy;

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await ClaimChallenge.countDocuments({
    profileId: profile._id,
    createdAt: { $gte: hourAgo },
  });
  if (recent >= HOURLY_LIMIT) return decoy;

  const doc = new ClaimChallenge({
    profileId: profile._id,
    accountId: profile.accountId,
    codeHash: "pending",
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  const code = String(crypto.randomInt(100000, 1000000));
  doc.codeHash = hashCode(doc._id, code);
  await doc.save();

  try {
    await sendSms({
      phoneNumber: profile.phone,
      message: `WelliRecord code ${code} to claim your record ${profile.wrId}. Valid 10 minutes. Do not share it with anyone.`,
    });
  } catch (error) {
    console.error("Claim SMS failed:", error.message);
  }

  return { requestId: doc._id, expiresAt: doc.expiresAt };
};

export const completeClaim = async ({ requestId, code, email, password }) => {
  const invalid = () => new AppError("Invalid or expired code", 400, "INVALID_CODE");

  if (!mongoose.isValidObjectId(requestId) || !/^\d{6}$/.test(String(code || ""))) throw invalid();

  const emailNorm = String(email || "").trim().toLowerCase();
  if (!EMAIL.test(emailNorm) || emailNorm.endsWith(SHELL_DOMAIN)) {
    throw new AppError("A valid email is required", 400, "INVALID_EMAIL");
  }
  if (String(password || "").length < 8) {
    throw new AppError("Password must be at least 8 characters", 400, "WEAK_PASSWORD");
  }

  const now = new Date();
  const challenge = await ClaimChallenge.findOneAndUpdate(
    { _id: requestId, usedAt: null, expiresAt: { $gt: now }, attempts: { $lt: MAX_ATTEMPTS } },
    { $inc: { attempts: 1 } },
    { new: true },
  );

  const given = hashCode(requestId, code);
  const ok =
    challenge &&
    challenge.codeHash.length === given.length &&
    crypto.timingSafeEqual(Buffer.from(challenge.codeHash), Buffer.from(given));
  if (!ok) throw invalid();

  const account = await Account.findById(challenge.accountId);
  if (!isUnclaimed(account)) throw invalid();

  const taken = await Account.findOne({ email: emailNorm, _id: { $ne: account._id } })
    .select("_id")
    .lean();
  if (taken) throw new AppError("Email already exists", 409, "EMAIL_ALREADY_EXISTS");

  const claimed = await ClaimChallenge.findOneAndUpdate(
    { _id: requestId, usedAt: null },
    { $set: { usedAt: now } },
  );
  if (!claimed) throw invalid();

  await withTransaction(async (session) => {
    account.email = emailNorm;
    account.password = password; // hashed by the model's pre-save hook
    account.status = "active";
    account.isVerified = true;
    account.isActive = true;
    await account.save({ session });
    await UserProfile.updateOne(
      { _id: challenge.profileId },
      { $set: { email: emailNorm } },
      { session },
    );
  });

  const profile = await UserProfile.findById(challenge.profileId).select("wrId").lean();
  return { wrId: profile?.wrId, email: emailNorm };
};
