import crypto from "crypto";
import { AppError } from "../../shared/errors/AppError.js";
import {
  generateEmailVerificationToken,
  generateWelliRecordId,
  getVerificationTokenExpiry,
  hashVerificationToken,
} from "../../shared/utils/helper.js";
import { withTransaction } from "../../shared/utils/withTransaction.js";
import { Account } from "../accounts/account_model.js";
import {
  createAccount,
  findAccountByEmail,
} from "../accounts/account_service.js";
import { OrganizationProfile } from "../organizations/organizations_model.js";
import { createOrganizationProfile } from "../organizations/organizations_services.js";
import { UserProfile } from "../users/user_profile_model.js";
import { createUserProfile } from "../users/users_services.js";
import { sendVerificationEmail } from "../../shared/utils/resend.js";

export const registerAccount = async (payload) => {
  console.log("🚀 ~ registerAccount ~ payload:", payload);
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

    await sendVerificationEmail({
      email: payload.email,
      fullName: payload.fullName,
      token: rawToken,
    });

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

    const rawToken = generateEmailVerificationToken();
    const tokenHash = hashVerificationToken(rawToken);
    const expiresAt = getVerificationTokenExpiry();

    const account = await createAccount(
      {
        accountType: "organization",
        role: null,
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

    await sendVerificationEmail({
      email: payload.email,
      fullName: payload.fullName,
      token: rawToken,
    });

    return {
      account: account.toSafeObject
        ? account.toSafeObject()
        : account.toObject(),
      profile: profile.toObject(),
    };
  });
};

export const loginAccount = async ({ email, password }) => {
  const normalizedEmail = email.trim().toLowerCase();
  console.log("🚀 ~ loginAccount ~ normalizedEmail:", normalizedEmail);

  const account = await Account.findOne({ email: normalizedEmail }).select(
    "+password",
  );
  // console.log("🚀 ~ loginAccount ~ account:", account)

  if (!account) {
    throw new Error("Invalid email or password");
  }

  if (!account.isActive || account.status !== "active") {
    throw new Error("Account is not active");
  }

  const isMatch = await account.comparePassword(password);

  if (!isMatch) {
    throw new Error("Invalid email or password");
  }

  let profile = null;

  if (account.accountType === "user") {
    profile = await UserProfile.findOne({ accountId: account._id });
  } else if (account.accountType === "organization") {
    profile = await OrganizationProfile.findOne({ accountId: account._id });
  }

  account.lastLoginAt = new Date();
  await account.save();
  // console.log("🚀 ~ loginAccount ~ profile:", profile)

  return {
    account: account.toSafeObject()
      ? account.toSafeObject()
      : account.toObject(),
    profile: profile ? profile.toObject() : null,
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
      "RESEND_COOLDOWN"
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

