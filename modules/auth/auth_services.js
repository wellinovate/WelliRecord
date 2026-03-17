import { AppError } from "../../shared/errors/AppError.js";
import mongoose from "mongoose";
import { Account } from "../accounts/account_model.js";
import { UserProfile } from "../users/user_profile_model.js";
import { OrganizationProfile } from "../organizations/organizations_model.js";
import { withTransaction } from "../../shared/utils/withTransaction.js";
import { createAccount, findAccountByEmail } from "../accounts/account_service.js";
import { createUserProfile } from "../users/users_services.js";
import { createOrganizationProfile } from "../organizations/organizations_services.js";

export const registerAccount = async (payload) => {
  console.log("🚀 ~ registerAccount ~ payload:", payload)
  if (payload.profileType === "personal") {
    return registerUserAccount(payload);
  }

  if (payload.profileType === "organization") {
    return registerOrganizationAccount(payload);
  }

  throw new AppError("Invalid profile type", 400, "INVALID_PROFILE_TYPE");
};

export const registerUserAccount = async (payload) => {
  return withTransaction(async (session) => {
    const existing = await findAccountByEmail(payload.email, session);

    if (existing) {
      throw new AppError("Email already exists", 409, "EMAIL_ALREADY_EXISTS");
    }

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
        gender: payload.gender,
        homeAddress: payload.homeAddress,
      },
      session,
    );

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
      },
      session,
    );

    const profile = await createOrganizationProfile(
      {
        accountId: account._id,
        organizationName: payload.organizationName,
        organizationType: payload.organizationMainType,
        officeAddress: payload.officeAddress,
        registrationNumber: payload.registrationNumber,
        licenseNumber: payload.licenseNumber,
        contactPersonName: payload.contactPersonName,
        contactPersonRole: payload.contactPersonRole,
      },
      session,
    );

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
  console.log("🚀 ~ loginAccount ~ normalizedEmail:", normalizedEmail)

  const account = await Account.findOne({ email: normalizedEmail }).select("+password");
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
  console.log("🚀 ~ loginAccount ~ profile:", profile)

  if (account.accountType === "user") {
    profile = await UserProfile.findOne({ accountId: account._id });
  } else if (account.accountType === "organization") {
    profile = await OrganizationProfile.findOne({ accountId: account._id });
  }

  account.lastLoginAt = new Date();
  await account.save();

  return {
    account: account.toSafeObject() ? account.toSafeObject() : account.toObject(),
    profile: profile ? profile.toObject() : null,
  };
};
