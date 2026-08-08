import crypto from "crypto";
import { AppError } from "../../shared/errors/AppError.js";
import { withTransaction } from "../../shared/utils/withTransaction.js";
import { Account } from "../accounts/account_model.js";
import { UserProfile } from "../users/user_profile_model.js";

// Dependant accounts are synthetic — they exist only so clinical
// records (allergies, medications, diagnoses, etc.) can attach to a
// real UserProfile._id via the existing clinicalMetadataFields.patientId
// contract, unchanged. They can never log in:
//   - email is a generated, unreachable address, never given to anyone
//   - password is random and discarded — never returned, never emailed
//   - isActive: false and status: "disabled" so the login flow's own
//     `!account.isActive || account.status !== "active"` check blocks
//     any authentication attempt outright, even in the event the
//     synthetic credentials were somehow guessed
function generateSyntheticEmail() {
  const token = crypto.randomBytes(12).toString("hex");
  return `dependant.${token}@internal.wellirecord.com`;
}

function generateUnusablePassword() {
  return crypto.randomBytes(24).toString("hex");
}

async function assertOwnership(dependantAccount, parentAccountId) {
  if (
    !dependantAccount ||
    String(dependantAccount.managedBy) !== String(parentAccountId)
  ) {
    throw new AppError("Dependant not found", 404, "DEPENDANT_NOT_FOUND");
  }
}

export const createDependantService = async ({ payload, authUser }) => {
  return withTransaction(async (session) => {
    const [account] = await Account.create(
      [
        {
          accountType: "user",
          role: "patient",
          email: generateSyntheticEmail(),
          password: generateUnusablePassword(),
          isActive: false,
          status: "disabled",
          isVerified: false,
          managedBy: authUser.accountId,
        },
      ],
      { session },
    );

    const [profile] = await UserProfile.create(
      [
        {
          accountId: account._id,
          fullName: payload.fullName,
          dateOfBirth: payload.dateOfBirth,
          gender: payload.gender || null,
        },
      ],
      { session },
    );

    return {
      dependantId: account._id,
      fullName: profile.fullName,
      dateOfBirth: profile.dateOfBirth,
      gender: profile.gender,
      avatar: profile.avatar,
      bloodGroup: profile.bloodGroup,
      genotype: profile.genotype,
      patientId: profile._id,
      wrId: profile.wrId,
    };
  });
};

export const listDependantsService = async ({ authUser }) => {
  const accounts = await Account.find({
    managedBy: authUser.accountId,
  }).select("_id");

  const accountIds = accounts.map((a) => a._id);
  if (accountIds.length === 0) return [];

  const profiles = await UserProfile.find({
    accountId: { $in: accountIds },
  });

  return profiles.map((profile) => ({
    dependantId: profile.accountId,
    fullName: profile.fullName,
    dateOfBirth: profile.dateOfBirth,
    gender: profile.gender,
    avatar: profile.avatar,
    bloodGroup: profile.bloodGroup,
    genotype: profile.genotype,
    patientId: profile._id,
    wrId: profile.wrId,
  }));
};

export const getDependantService = async ({ dependantId, authUser }) => {
  const account = await Account.findById(dependantId);
  await assertOwnership(account, authUser.accountId);

  const profile = await UserProfile.findOne({ accountId: dependantId });
  if (!profile) {
    throw new AppError("Dependant not found", 404, "DEPENDANT_NOT_FOUND");
  }

  return {
    dependantId: account._id,
    fullName: profile.fullName,
    dateOfBirth: profile.dateOfBirth,
    gender: profile.gender,
    avatar: profile.avatar,
    bloodGroup: profile.bloodGroup,
    genotype: profile.genotype,
    patientId: profile._id,
    wrId: profile.wrId,
  };
};

export const updateDependantService = async ({
  dependantId,
  payload,
  authUser,
}) => {
  const account = await Account.findById(dependantId);
  await assertOwnership(account, authUser.accountId);

  const profile = await UserProfile.findOne({ accountId: dependantId });
  if (!profile) {
    throw new AppError("Dependant not found", 404, "DEPENDANT_NOT_FOUND");
  }

  // Explicit field list, not a spread — same pattern this codebase
  // already relies on elsewhere (see updateUserProfileService) to keep
  // writes limited to exactly what the parent is allowed to set.
  const updatable = [
    "fullName",
    "dateOfBirth",
    "gender",
    "avatar",
    "bloodGroup",
    "genotype",
  ];
  for (const field of updatable) {
    if (payload[field] !== undefined) {
      profile[field] = payload[field];
    }
  }

  await profile.save();

  return {
    dependantId: account._id,
    fullName: profile.fullName,
    dateOfBirth: profile.dateOfBirth,
    gender: profile.gender,
    avatar: profile.avatar,
    bloodGroup: profile.bloodGroup,
    genotype: profile.genotype,
    patientId: profile._id,
    wrId: profile.wrId,
  };
};
