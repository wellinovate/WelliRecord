import crypto from "crypto";
import { AppError } from "../../shared/errors/AppError.js";
import {
  generateEmailVerificationToken,
  generateLoginChallengeToken,
  generateWelliRecordId,
  getLoginOtpExpiry,
  getVerificationTokenExpiry,
  hashLoginChallengeToken,
  hashVerificationToken,
  maskPhone,
} from "../../shared/utils/helper.js";
import { withTransaction } from "../../shared/utils/withTransaction.js";
import { Account } from "../accounts/account_model.js";
import {
  createAccount,
  findAccountByEmail,
  findAccountByPhone,
} from "../accounts/account_service.js";
import { OrganizationProfile } from "../organizations/organizations_model.js";
import { createOrganizationProfile } from "../organizations/organizations_services.js";
import { UserProfile } from "../users/user_profile_model.js";
import { createUserProfile } from "../users/users_services.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "../../shared/utils/resend.js";
import bcrypt from "bcryptjs";
import { OrganizationMembership } from "../memberships/organization_membership_model.js";
import { sendLoginOtp, verifyLoginOtp, sendEmailOtp, generateOtpCode } from "../../shared/utils/termii.js";
import { LoginOtpChallenge } from "./login_otp_challenge_model.js";



export const registerAccount = async (payload) => {
  // console.log("🚀 ~ registerAccount ~ payload:", payload);
  if (payload.accountType === "user") {
    return registerUserAccount(payload);
  }

  if (payload.accountType === "organization") {
    return registerOrganizationAccount(payload);
  }

  throw new AppError("Invalid account type", 400, "INVALID_PROFILE_TYPE");
};

export const registerUserAccount = async (payload) => {
  // console.log("🚀 ~ registerUserAccount ~ payload:", payload)
  return withTransaction(async (session) => {
    const existing = await findAccountByEmail(payload.email, session);

    if (existing) {
      throw new AppError("Email already exists", 409, "EMAIL_ALREADY_EXISTS");
    }

    if (payload.phone) {
      const existingPhone = await findAccountByPhone(payload.phone, session);
      if (existingPhone) {
        throw new AppError(
          "This phone number is already registered to another account",
          409,
          "PHONE_ALREADY_EXISTS",
        );
      }
    }

    const rawToken = generateEmailVerificationToken();
    const tokenHash = hashVerificationToken(rawToken);
    const expiresAt = getVerificationTokenExpiry();

    const account = await createAccount(
      {
        accountType: "user",
        role: payload.role || "patient",
        email: payload.email,
        password: payload.password,
        phone: payload.phone,
        img: payload.img,
        status: "active",
        isVerified: false,
        isActive: true,
        verificationTokenHash: tokenHash,
        verificationTokenExpiresAt: expiresAt,
        verificationLastSentAt: new Date(),
      },
      session,
    );

    const profile = await createUserProfile(
      {
        accountId: account._id,
        fullName: payload.fullName,
        username: payload.username,
        firstName: payload.firstName,
        middleName: payload.middleName,
        lastName: payload.lastName,
        email: payload.email,
        phone: payload.phone,
        gender: payload.gender,
        homeAddress: payload.address,
      },
      session,
    );

    try {
      await sendVerificationEmail({
        email: payload.email,
        fullName: payload.fullName,
        token: rawToken,
      });
    } catch (err) {
      console.error("Signup succeeded but verification email failed to send:", err);
    }

    return {
      account: account.toSafeObject
        ? account.toSafeObject()
        : account.toObject(),
      profile: profile.toObject(),
    };
  });
};

export const registerOrganizationAccount = async (payload) => {
  return withTransaction(async (session) => {
    const existing = await findAccountByEmail(payload.email, session);

    if (existing) {
      throw new AppError("Email already exists", 409, "EMAIL_ALREADY_EXISTS");
    }

    if (payload.phone) {
      const existingPhone = await findAccountByPhone(payload.phone, session);
      if (existingPhone) {
        throw new AppError(
          "This phone number is already registered to another account",
          409,
          "PHONE_ALREADY_EXISTS",
        );
      }
    }

    const rawToken = generateEmailVerificationToken();
    const tokenHash = hashVerificationToken(rawToken);
    const expiresAt = getVerificationTokenExpiry();

    const account = await createAccount(
      {
        accountType: "organization",
        role: "provider_admin",
        email: payload.email,
        password: payload.password,
        phone: payload.phone,
        img: payload.img,
        status: "active",
        isVerified: false,
        isActive: true,
        verificationTokenHash: tokenHash,
        verificationTokenExpiresAt: expiresAt,
        verificationLastSentAt: new Date(),
      },
      session,
    );

    const wrId = generateWelliRecordId();

    const profile = await createOrganizationProfile(
      {
        accountId: account._id,
        wrOrgId: wrId,
        organizationName: payload.organizationName,
        organizationType: payload.organizationType,
        // Defaults to "general" via the schema itself if omitted —
        // every non-healthcare_provider org type sends this as
        // undefined, which is fine, the model default handles it.
        clinicalScope: payload.clinicalScope,
        officeAddress: payload.officeAddress,
        registrationNumber: payload.registrationNumber,
        licenseNumber: payload.licenseNumber,
        contactPersonName: payload.contactPersonName,
        contactPersonRole: payload.contactPersonRole,
      },
      session,
    );

    try {
      await sendVerificationEmail({
        email: payload.email,
        fullName: payload.fullName,
        token: rawToken,
      });
    } catch (err) {
      console.error("Signup succeeded but verification email failed to send:", err);
    }

    return {
      account: account.toSafeObject
        ? account.toSafeObject()
        : account.toObject(),
      profile: profile.toObject(),
    };
  });
};

// 
const hashOtpCode = (code) => crypto.createHash("sha256").update(String(code)).digest("hex");

const maskEmail = (email) => {
  const [name, domain] = String(email || "").split("@");
  if (!name || !domain) return email;
  const visible = name.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(name.length - 2, 1))}@${domain}`;
};

const createSmsOtpChallenge = async (account) => {
  const phone = account.phone;

  if (!phone) {
    throw new AppError(
      "No phone number is attached to this account. Please contact support.",
      400,
      "PHONE_NOT_FOUND",
    );
  }

  let otp;
  try {
    otp = await sendLoginOtp({ phoneNumber: phone });
  } catch (error) {
    if (error.message === "SMS_PROVIDER_INSUFFICIENT_BALANCE") {
      throw new AppError(
        "Login code could not be sent right now. Please contact support.",
        503,
        "OTP_PROVIDER_UNAVAILABLE",
      );
    }
    if (error.message === "INVALID_PHONE_NUMBER") {
      throw new AppError(
        "Invalid phone number attached to this account. Please contact support.",
        400,
        "INVALID_ACCOUNT_PHONE",
      );
    }
    throw new AppError(
      "Unable to send login code. Please try again.",
      502,
      "OTP_SEND_FAILED",
    );
  }

  const challengeToken = generateLoginChallengeToken();
  const challengeTokenHash = hashLoginChallengeToken(challengeToken);

  await LoginOtpChallenge.create({
    accountId: account._id,
    challengeTokenHash,
    channel: "sms",
    termiiPinId: otp.pinId,
    phone,
    expiresAt: getLoginOtpExpiry(),
  });

  return {
    requiresOtp: true,
    channel: "sms",
    challengeToken,
    maskedPhone: maskPhone(phone),
    message: "Login code sent successfully.",
  };
};

const createEmailOtpChallenge = async (account) => {
  const email = account.email;

  if (!email) {
    throw new AppError(
      "No email address is attached to this account. Please contact support.",
      400,
      "EMAIL_NOT_FOUND",
    );
  }

  const code = generateOtpCode(6);

  try {
    await sendEmailOtp({ email, code });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "Unable to send login code. Please try again.",
      502,
      "OTP_SEND_FAILED",
    );
  }

  const challengeToken = generateLoginChallengeToken();
  const challengeTokenHash = hashLoginChallengeToken(challengeToken);

  await LoginOtpChallenge.create({
    accountId: account._id,
    challengeTokenHash,
    channel: "email",
    codeHash: hashOtpCode(code),
    email,
    expiresAt: getLoginOtpExpiry(),
  });

  return {
    requiresOtp: true,
    channel: "email",
    challengeToken,
    maskedEmail: maskEmail(email),
    message: "Login code sent successfully.",
  };
};

export const loginAccount = async ({ email, password, channel }) => {
  if (!email || !password) {
    throw new AppError(
      "Email and password are required",
      400,
      "MISSING_LOGIN_FIELDS",
    );
  }

  const normalizedEmail = email.trim().toLowerCase();
  const account = await Account.findByEmailWithPassword(normalizedEmail);

  if (!account) {
    throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
  }
  if (!account.isActive || account.status !== "active") {
    throw new AppError("Account is not active", 403, "ACCOUNT_INACTIVE");
  }
  if (!account.isVerified) {
    throw new AppError(
      "Please verify your email before logging in. Check your inbox for the verification link.",
      403,
      "EMAIL_NOT_VERIFIED",
    );
  }

  const isMatch = await account.comparePassword(password);
  if (!isMatch) {
    throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
  }

  const normalizedChannel = channel === "email" ? "email" : "sms";

  return normalizedChannel === "email"
    ? createEmailOtpChallenge(account)
    : createSmsOtpChallenge(account);
};

export const startGoogleLoginOtp = async (account, channel) => {
  const normalizedChannel = channel === "email" ? "email" : "sms";

  return normalizedChannel === "email"
    ? createEmailOtpChallenge(account)
    : createSmsOtpChallenge(account);
};

export const verifyLoginCodeService = async ({ challengeToken, code }) => {
  const totalStart = performance.now();

  if (!challengeToken || !code) {
    throw new AppError(
      "Challenge token and code are required",
      400,
      "OTP_REQUIRED",
    );
  }

  const normalizedCode = String(code).trim();

  const challengeTokenHash = hashLoginChallengeToken(challengeToken);

  const challenge = await LoginOtpChallenge.findOne({
    challengeTokenHash,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  });

  if (!challenge) {
    throw new AppError(
      "Login verification has expired",
      400,
      "LOGIN_CHALLENGE_EXPIRED",
    );
  }

  if (challenge.attempts >= challenge.maxAttempts) {
    throw new AppError(
      "Too many incorrect attempts",
      429,
      "OTP_ATTEMPTS_EXCEEDED",
    );
  }

  let verified = false;

  if (challenge.channel === "email") {
    verified = challenge.codeHash === hashOtpCode(code);
  } else {
    const termiiResult = await verifyLoginOtp({
      pinId: challenge.termiiPinId,
      pin: code,
    });
    verified =
      termiiResult?.verified === true ||
      termiiResult?.status === "verified" ||
      termiiResult?.message?.toLowerCase?.().includes("verified");
  }

  if (!verified) {
    await LoginOtpChallenge.updateOne(
      {
        _id: challenge._id,
        usedAt: null,
      },
      {
        $inc: { attempts: 1 },
      },
    );

    throw new AppError(
      "Invalid or expired login code",
      400,
      "INVALID_LOGIN_CODE",
    );
  }

  const consumeResult = await LoginOtpChallenge.updateOne(
    {
      _id: challenge._id,
      usedAt: null,
      expiresAt: { $gt: new Date() },
    },
    {
      $set: {
        usedAt: new Date(),
      },
    },
  );

  if (consumeResult.modifiedCount !== 1) {
    throw new AppError(
      "Login verification has already been used",
      400,
      "LOGIN_CHALLENGE_ALREADY_USED",
    );
  }

  const account = await Account.findById(challenge.accountId);

  if (!account) {
    throw new AppError("Account not found", 404, "ACCOUNT_NOT_FOUND");
  }

  if (!account.isActive || account.status !== "active") {
    throw new AppError("Account is not active", 403, "ACCOUNT_INACTIVE");
  }

  let profile = null;
  // let memberships = [];

  if (account.accountType === "user") {
    profile = await UserProfile.findOne({ accountId: account._id })
      .select("_id  fullName  email phone avatar  gender wrId isVerified")
      .lean();

    if (!profile) {
      throw new AppError(
        "User profile not found",
        404,
        "USER_PROFILE_NOT_FOUND",
      );
    }

    // if (account.role !== "patient") {
    //   memberships = await OrganizationMembership.find({
    //     userId: profile._id,
    //     status: "active",
    //   })
    //     .select("_id userId organizationId role status departmentId permissions createdAt")
    //     .populate({
    //       path: "organizationId",
    //       select:
    //         "organizationName organizationId organizationType logo address contactEmail phone",
    //     })
    //     .lean();
    // }
  }

  if (account.accountType === "organization") {
    profile = await OrganizationProfile.findOne({
      accountId: account._id,
    })
      .select(
        "_id organizationName organizationId organizationType logo phone wrOrgId",
      )
      .lean();

    if (!profile) {
      throw new AppError(
        "Organization profile not found",
        404,
        "ORGANIZATION_PROFILE_NOT_FOUND",
      );
    }
  }

  Account.updateOne(
    { _id: account._id },
    { $set: { lastLoginAt: new Date() } },
  ).catch((err) => {
    console.error("Failed to update lastLoginAt:", err.message);
  });

  return {
    account: account.toSafeObject(),
    profile,
    // memberships,
  };
};



export const resendLoginOtpService = async ({ email, challengeToken, channel }) => {
  let account = null;

  if (challengeToken && typeof challengeToken === "string") {
    const challengeTokenHash = hashLoginChallengeToken(challengeToken);
    const existingChallenge = await LoginOtpChallenge.findOne({ challengeTokenHash }).sort({ createdAt: -1 });
    if (existingChallenge) {
      account = await Account.findById(existingChallenge.accountId);
    }
  }

  if (!account && email && typeof email === "string" && email.includes("@")) {
    account = await Account.findOne({ email: email.toLowerCase().trim() });
  }

  if (!account) {
    throw new AppError("Account not found", 404, "ACCOUNT_NOT_FOUND");
  }

  const lastOtp = await LoginOtpChallenge.findOne({
    accountId: account._id,
  }).sort({ createdAt: -1 });

  if (lastOtp) {
    const cooldownMs = 30 * 1000;
    const now = Date.now();
    if (lastOtp.createdAt.getTime() + cooldownMs > now) {
      throw new AppError(
        "Please wait before requesting another OTP",
        429,
        "OTP_COOLDOWN",
      );
    }
  }

  const normalizedChannel = channel === "email" || channel === "sms"
    ? channel
    : (lastOtp?.channel || "sms");

  return normalizedChannel === "email"
    ? createEmailOtpChallenge(account)
    : createSmsOtpChallenge(account);
};

export const generateVerificationToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

export const verifyEmailService = async (token) => {
  if (!token) {
    throw new AppError("Verification token is required", 400, "TOKEN_REQUIRED");
  }

  const tokenHash = hashVerificationToken(token);

  const account = await Account.findOne({
    verificationTokenHash: tokenHash,
  });

  if (!account) {
    throw new AppError("Invalid verification token", 400, "INVALID_TOKEN");
  }

  if (account.isVerified) {
    return {
      message: "Email is already verified.",
    };
  }

  if (
    !account.verificationTokenExpiresAt ||
    account.verificationTokenExpiresAt.getTime() < Date.now()
  ) {
    throw new AppError("Verification token has expired", 400, "TOKEN_EXPIRED");
  }

  account.isVerified = true;
  account.verificationTokenHash = null;
  account.verificationTokenExpiresAt = null;
  account.verificationLastSentAt = null;

  await account.save();

  return {
    message: "Email verified successfully.",
  };
};

const RESET_TOKEN_COOLDOWN_MS = 1000 * 60 * 2; // 2 minutes between requests
const RESET_TOKEN_TTL_MS = 1000 * 60 * 30; // 30 minutes, matches email verification

const hashResetToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

// Requesting a reset never reveals whether the email exists — the response
// is identical either way so the endpoint can't be used to enumerate
// registered accounts. Only when an account *is* found do we generate a
// token and send the email; the cooldown check below only applies then.
export const requestPasswordResetService = async (email) => {
  const normalizedEmail = String(email || "").toLowerCase().trim();

  if (!normalizedEmail) {
    throw new AppError("Email is required", 400, "EMAIL_REQUIRED");
  }

  const account = await Account.findOne({ email: normalizedEmail });

  if (!account) {
    return {
      message: "If an account exists for that email, a reset link has been sent.",
    };
  }

  const now = Date.now();
  if (
    account.resetPasswordLastSentAt &&
    now - new Date(account.resetPasswordLastSentAt).getTime() < RESET_TOKEN_COOLDOWN_MS
  ) {
    // Still return the generic message — don't leak the cooldown state to
    // the caller, same reasoning as the account-not-found case above.
    return {
      message: "If an account exists for that email, a reset link has been sent.",
    };
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  account.resetPasswordTokenHash = hashResetToken(rawToken);
  account.resetPasswordTokenExpiresAt = new Date(now + RESET_TOKEN_TTL_MS);
  account.resetPasswordLastSentAt = new Date(now);

  await account.save();

  let fullName = account.email;
  if (account.accountType === "organization") {
    const org = await OrganizationProfile.findOne({ accountId: account._id }).select("organizationName");
    fullName = org?.organizationName || account.email;
  } else {
    const profile = await UserProfile.findOne({ accountId: account._id }).select("fullName");
    fullName = profile?.fullName || account.email;
  }

  await sendPasswordResetEmail({
    email: account.email,
    fullName,
    token: rawToken,
  });

  return {
    message: "If an account exists for that email, a reset link has been sent.",
  };
};

export const resetPasswordService = async ({ token, newPassword }) => {
  if (!token) {
    throw new AppError("Reset token is required", 400, "TOKEN_REQUIRED");
  }
  if (!newPassword || newPassword.length < 8) {
    throw new AppError(
      "Password must be at least 8 characters",
      400,
      "INVALID_PASSWORD",
    );
  }

  const tokenHash = hashResetToken(token);

  const account = await Account.findOne({ resetPasswordTokenHash: tokenHash });

  if (!account) {
    throw new AppError("Invalid or expired reset link", 400, "INVALID_TOKEN");
  }

  if (
    !account.resetPasswordTokenExpiresAt ||
    account.resetPasswordTokenExpiresAt.getTime() < Date.now()
  ) {
    throw new AppError("This reset link has expired", 400, "TOKEN_EXPIRED");
  }

  // Assigning here (not findOneAndUpdate) so the pre("save") hook on
  // Account re-hashes the password and stamps passwordChangedAt, same as
  // every other password write in this codebase.
  account.password = newPassword;
  account.resetPasswordTokenHash = null;
  account.resetPasswordTokenExpiresAt = null;
  account.resetPasswordLastSentAt = null;

  await account.save();

  return {
    message: "Password reset successfully. You can now log in with your new password.",
  };
};

export const resendVerificationEmailService = async (email) => {
  const account = await Account.findOne({ email: email.toLowerCase().trim() });

  if (!account) {
    throw new AppError("Account not found", 404, "ACCOUNT_NOT_FOUND");
  }

  if (account.isVerified) {
    throw new AppError("Email is already verified", 400, "ALREADY_VERIFIED");
  }

  const now = Date.now();
  const cooldownMs = 1000 * 60 * 2; // 2 minutes

  if (
    account.verificationLastSentAt &&
    now - new Date(account.verificationLastSentAt).getTime() < cooldownMs
  ) {
    throw new AppError(
      "Please wait before requesting another verification email",
      429,
      "RESEND_COOLDOWN",
    );
  }

  const rawToken = generateEmailVerificationToken();
  const tokenHash = hashVerificationToken(rawToken);

  account.verificationTokenHash = tokenHash;
  account.verificationTokenExpiresAt = getVerificationTokenExpiry();
  account.verificationLastSentAt = new Date();

  await account.save();

  await sendVerificationEmail({
    email: account.email,
    fullName: account.email,
    token: rawToken,
  });

  return {
    message: "Verification email resent successfully.",
  };
};
