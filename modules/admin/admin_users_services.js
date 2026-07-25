import { Account } from "../accounts/account_model.js";
import { UserProfile } from "../users/user_profile_model.js";
import { OrganizationProfile } from "../organizations/organizations_model.js";

const toPositiveInt = (value, fallback, max = 200) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), max);
};

export const listPlatformUsersService = async ({ page = 1, limit = 20 } = {}) => {
  const numericPage = toPositiveInt(page, 1);
  const numericLimit = toPositiveInt(limit, 20, 100);
  const skip = (numericPage - 1) * numericLimit;

  const [accounts, total] = await Promise.all([
    Account.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numericLimit)
      .select("email accountType role isVerified status isActive createdAt")
      .lean(),
    Account.countDocuments({}),
  ]);

  const userAccountIds = accounts
    .filter((a) => a.accountType === "user")
    .map((a) => a._id);

  const orgAccountIds = accounts
    .filter((a) => a.accountType === "organization")
    .map((a) => a._id);

  const [userProfiles, orgProfiles] = await Promise.all([
    userAccountIds.length
      ? UserProfile.find({ accountId: { $in: userAccountIds } })
          .select("accountId fullName firstName lastName")
          .lean()
      : [],
    orgAccountIds.length
      ? OrganizationProfile.find({ accountId: { $in: orgAccountIds } })
          .select("accountId organizationName organizationType")
          .lean()
      : [],
  ]);

  const userProfileByAccountId = new Map(
    userProfiles.map((p) => [String(p.accountId), p]),
  );
  const orgProfileByAccountId = new Map(
    orgProfiles.map((p) => [String(p.accountId), p]),
  );

  const items = accounts.map((account) => {
    const isOrg = account.accountType === "organization";
    const profile = isOrg
      ? orgProfileByAccountId.get(String(account._id))
      : userProfileByAccountId.get(String(account._id));

    const fullName = isOrg
      ? profile?.organizationName || null
      : profile?.fullName ||
        [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") ||
        null;

    return {
      id: account._id,
      email: account.email,
      fullName,
      accountType: account.accountType,
      role: account.role,
      org: isOrg ? profile?.organizationName || null : null,
      isVerified: Boolean(account.isVerified),
      status: account.isActive === false ? "Suspended" : "Active",
      createdAt: account.createdAt,
    };
  });

  return {
    items,
    total,
    page: numericPage,
    limit: numericLimit,
    totalPages: Math.ceil(total / numericLimit),
  };
};
