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
import { sendVerificationEmail } from "../../shared/utils/resend.js";
import bcrypt from "bcryptjs";
import { OrganizationMembership } from "../memberships/organization_membership_model.js";
import { sendLoginOtp, verifyLoginOtp } from "../../shared/utils/termii.js";
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

// export const loginAccount = async ({ email, password }) => {
//   const totalStart = performance.now();

//   const normalizedEmail = email.trim().toLowerCase();

//   const findStart = performance.now();

//   const account = await Account.findByEmailWithPassword(normalizedEmail);

//   console.log(
//     "⏱ find account:",
//     (performance.now() - findStart).toFixed(2),
//     "ms"
//   );

//   if (!account) {
//     throw new Error("Invalid email or password");
//   }

//   if (!account.isActive || account.status !== "active") {
//     throw new Error("Account is not active");
//   }

//   const currentRounds = Number(account.password.split("$")[2]);

//   console.log("bcrypt rounds:", currentRounds);

//   const passwordStart = performance.now();

//   const isMatch = await account.comparePassword(password);

//   console.log(
//     "⏱ password compare:",
//     (performance.now() - passwordStart).toFixed(2),
//     "ms"
//   );

//   if (!isMatch) {
//     throw new Error("Invalid email or password");
//   }

//   let profile = null;
//   let memberships = [];

//   if (account.accountType === "user") {
//     const profileStart = performance.now();

//     profile = await UserProfile.findOne({ accountId: account._id })
//       .select("_id firstName fullName lastName email phone avatar dateOfBirth gender wrId")
//       .lean();

//     console.log(
//       "⏱ user profile:",
//       (performance.now() - profileStart).toFixed(2),
//       "ms"
//     );

//     if (!profile) {
//       throw new Error("User profile not found");
//     }

//     if (account.role !== "patient") {
//       const membershipStart = performance.now();

//       memberships = await OrganizationMembership.find({
//         userId: profile._id,
//         status: "active",
//       })
//         .select(
//           "_id userId organizationId role status departmentId permissions createdAt"
//         )
//         .populate({
//           path: "organizationId",
//           select:
//             "organizationName organizationId organizationType logo address contactEmail phone",
//         })
//         .lean();

//       console.log(
//         "⏱ memberships:",
//         (performance.now() - membershipStart).toFixed(2),
//         "ms"
//       );
//     }
//   }

//   if (account.accountType === "organization") {
//     const orgProfileStart = performance.now();

//     profile = await OrganizationProfile.findOne({
//       accountId: account._id,
//     })
//       .select(
//         "_id organizationName organizationId organizationType logo address contactEmail phone"
//       )
//       .lean();

//     console.log(
//       "⏱ organization profile:",
//       (performance.now() - orgProfileStart).toFixed(2),
//       "ms"
//     );

//     if (!profile) {
//       throw new Error("Organization profile not found");
//     }
//   }

//   Account.updateOne(
//     { _id: account._id },
//     { $set: { lastLoginAt: new Date() } }
//   ).catch((err) => {
//     console.error("Failed to update lastLoginAt:", err.message);
//   });

//   if (currentRounds > 10) {
//     setImmediate(() => {
//       bcrypt
//         .hash(password, 10)
//         .then((newHash) => {
//           return Account.updateOne(
//             { _id: account._id },
//             {
//               $set: {
//                 password: newHash,
//                 passwordChangedAt: new Date(),
//               },
//             }
//           );
//         })
//         .catch((err) => {
//           console.error("Password rehash failed:", err.message);
//         });
//     });
//   }

//   const safeAccount = account.toSafeObject();

//   console.log(
//     "⏱ TOTAL LOGIN:",
//     (performance.now() - totalStart).toFixed(2),
//     "ms"
//   );

//   return {
//     account: safeAccount,
//     profile,
//     memberships,
//   };
// };

export const loginAccount = async ({ email, password }) => {
  if (!email || !password) {
    throw new AppError(
      "Email and password are required",
      400,
      "MISSING_LOGIN_FIELDS",
    );
  }
  const totalStart = performance.now();

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
    termiiPinId: otp.pinId,
    phone,
    expiresAt: getLoginOtpExpiry(),
  });

  console.log(
    "⏱ LOGIN PASSWORD STEP:",
    (performance.now() - totalStart).toFixed(2),
    "ms",
  );

  return {
    requiresOtp: true,
    challengeToken,
    maskedPhone: maskPhone(phone),
    message: "Login code sent successfully.",
  };
};

// Sends an SMS login code to an existing account's phone on file, reusing
// the same Termii OTP + LoginOtpChallenge mechanism password login already
// uses. Used by Google sign-in for accounts that already existed before
// this request (new accounts have no phone yet and skip straight to
// onboarding instead — see googleLoginController).
export const startGoogleLoginOtp = async (account) => {
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
    termiiPinId: otp.pinId,
    phone,
    expiresAt: getLoginOtpExpiry(),
  });

  return {
    requiresOtp: true,
    challengeToken,
    maskedPhone: maskPhone(phone),
    message: "Login code sent successfully.",
  };
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

  const termiiResult = await verifyLoginOtp({
    pinId: challenge.termiiPinId,
    pin: code,
  });

  const verified =
    termiiResult?.verified === true ||
    termiiResult?.status === "verified" ||
    termiiResult?.message?.toLowerCase?.().includes("verified");

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



export const resendLoginOtpService = async ({ email }) => {
  // 1. Find account
  const account = await Account.findOne({ email: email.toLowerCase().trim() });
  if (!account) {
    throw new AppError("Account not found", 404, "ACCOUNT_NOT_FOUND");
  }

  if (!account.phone) {
    throw new AppError("No phone attached to account", 400, "PHONE_NOT_FOUND");
  }

  // 2. Check cooldown (optional: 60s or 2min)
  const lastOtp = await LoginOtpChallenge.findOne({
    accountId: account._id,
  }).sort({ createdAt: -1 });
  if (lastOtp) {
    const cooldownMs = 60 * 1000; // 1 minute
    const now = Date.now();
    if (lastOtp.createdAt.getTime() + cooldownMs > now) {
      throw new AppError(
        "Please wait before requesting another OTP",
        429,
        "OTP_COOLDOWN",
      );
    }
  }

  // 3. Send new OTP via Termii
  let otp;
  try {
    otp = await sendLoginOtp({ phoneNumber: account.phone });
  } catch (err) {
    throw new AppError("Unable to send OTP now", 502, "OTP_SEND_FAILED");
  }

  // 4. Generate challenge token
  const challengeToken = generateLoginChallengeToken();
  const challengeTokenHash = hashLoginChallengeToken(challengeToken);

  // 5. Save OTP challenge
  await LoginOtpChallenge.create({
    accountId: account._id,
    challengeTokenHash,
    termiiPinId: otp.pinId,
    phone: account.phone,
    expiresAt: getLoginOtpExpiry(),
  });

  return {
    message: "OTP resent successfully",
    challengeToken,
    maskedPhone: account.phone.replace(/\d(?=\d{4})/g, "*"),
  };
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
