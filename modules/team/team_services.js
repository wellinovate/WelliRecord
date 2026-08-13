import crypto from "crypto";
import { AppError } from "../../shared/errors/AppError.js";
import { OrganizationMembership } from "../memberships/organization_membership_model.js";
import { UserProfile } from "../users/user_profile_model.js";
import { Account } from "../accounts/account_model.js";
import { TeamInvite } from "./team_invite_model.js";
import { withTransaction } from "../../shared/utils/withTransaction.js";
import { sendTeamInviteEmail } from "../../shared/utils/resend.js";
import { OrganizationProfile } from "../organizations/organizations_model.js";
import { createNotification } from "../notifications/notification_services.js";

import { getRoleCatalog, isRoleAllowed } from "./role_catalog.js";
import { getEffectivePermissions, getRoleDefaultPermissions, PERMISSIONS, PERMISSION_CATEGORIES, PERMISSION_KEYS } from "./permission_registry.js";

// Account.role and OrganizationMembership.membershipRole are two
// different enums that only partially overlap. Account.role only
// allows patient/provider/doctor/nurse/caregiver/staff/admin/
// provider_admin — passing a membershipRole like "lab_tech" or
// "pharmacist" straight through would fail Account validation before
// the membership is ever created. The specific job function lives on
// membershipRole; Account.role only needs a coarse system-level value.
const ACCOUNT_ROLE_MAP = {
  provider_admin: "provider_admin",
  doctor: "doctor",
  nurse: "nurse",
};

function toAccountRole(membershipRole) {
  return ACCOUNT_ROLE_MAP[membershipRole] || "staff";
}

// Exposed to the frontend via GET /team/role-catalog so the invite
// dropdown only offers roles that make sense for this facility's type
// — a diagnostic lab doesn't see "Nurse", an eye-care-scoped hospital
// sees "Optician / Ophthalmologist" instead of a plain "Doctor" label.
// See role_catalog.js for the mapping.
export const getRoleCatalogService = async ({ organizationId }) => {
  const orgProfile = await OrganizationProfile.findOne({
    accountId: organizationId,
  })
    .select("organizationType clinicalScope")
    .lean();

  return getRoleCatalog({
    organizationType: orgProfile?.organizationType,
    clinicalScope: orgProfile?.clinicalScope,
  });
};

// Exposed to the frontend via GET /team/permissions so the "Access"
// panel on each member row can render checkboxes with real labels,
// grouped the same way for every facility, and grey out the ones that
// come from the role default versus ones the admin explicitly granted.
export const getPermissionRegistryService = () => {
  const roles = [
    "provider_admin", "doctor", "clinician", "nurse", "lab_tech",
    "pharmacist", "frontdesk", "insurer_agent", "support_staff",
  ];
  const roleDefaults = Object.fromEntries(
    roles.map((role) => [role, getRoleDefaultPermissions(role)]),
  );

  return {
    categories: PERMISSION_CATEGORIES,
    permissions: PERMISSIONS,
    roleDefaults,
  };
};

export const getMyMembershipService = async ({ profileId }) => {
  if (!profileId) return null;

  const membership = await OrganizationMembership.findOne({
    userId: profileId,
    isActive: true,
  }).lean();

  if (!membership) return null;

  const permissions = getEffectivePermissions(
    membership.membershipRole,
    membership.permissionOverrides,
  );

  return {
    membershipId: membership._id.toString(),
    organizationId: membership.organizationId.toString(),
    role: membership.membershipRole,
    permissions,
    permissionOverrides: membership.permissionOverrides || { granted: [], revoked: [] },
  };
};

export const listTeamMembersService = async ({ organizationId }) => {
  const memberships = await OrganizationMembership.find({ organizationId }).populate("userId");

  const memberList = memberships.map((m) => {
    const profile = m.userId || {};
    return {
      userId: profile.accountId || profile._id,
      membershipId: m._id,
      name: profile.fullName || "Team Member",
      email: profile.email || "",
      role: m.membershipRole,
      permissions: getEffectivePermissions(m.membershipRole, m.permissionOverrides),
      permissionOverrides: {
        granted: m.permissionOverrides?.granted || [],
        revoked: m.permissionOverrides?.revoked || [],
      },
      status: m.isActive ? "active" : "suspended",
      lastActive: profile.updatedAt || m.updatedAt || null,
    };
  });

  const invites = await TeamInvite.find({ organizationId, status: "pending" });
  const inviteList = invites.map((inv) => ({
    userId: inv._id,
    membershipId: null,
    inviteId: inv._id,
    name: inv.fullName,
    email: inv.email,
    role: inv.membershipRole,
    permissions: getRoleDefaultPermissions(inv.membershipRole),
    permissionOverrides: { granted: [], revoked: [] },
    status: "invited",
    lastActive: null,
  }));

  return [...memberList, ...inviteList];
};

// An admin can only adjust a member's overrides, never a provider_admin's
// — that role always has full access regardless of overrides, see
// permission_registry.js, so there's nothing to restrict there and
// nothing to accidentally lock an admin out of.
export const updateMemberPermissionsService = async ({
  organizationId,
  membershipId,
  granted = [],
  revoked = [],
}) => {
  const membership = await OrganizationMembership.findOne({
    _id: membershipId,
    organizationId,
  });
  if (!membership) {
    throw new AppError("Team member not found", 404, "MEMBER_NOT_FOUND");
  }
  if (membership.membershipRole === "provider_admin") {
    throw new AppError(
      "An administrator's access can't be restricted",
      422,
      "CANNOT_OVERRIDE_ADMIN",
    );
  }

  const validGranted = granted.filter((k) => PERMISSION_KEYS.includes(k));
  const validRevoked = revoked.filter((k) => PERMISSION_KEYS.includes(k));
  // A key can't be both granted and revoked at once — revoked wins,
  // since "take this away" should never lose to a stale grant.
  membership.permissionOverrides = {
    granted: validGranted.filter((k) => !validRevoked.includes(k)),
    revoked: validRevoked,
  };
  await membership.save();

  return {
    membershipId: membership._id,
    permissions: getEffectivePermissions(membership.membershipRole, membership.permissionOverrides),
    permissionOverrides: membership.permissionOverrides,
  };
};

export const inviteTeamMemberService = async ({ organizationId, payload }) => {
  const { email, fullName, membershipRole } = payload;

  // Defense in depth: the frontend hides roles that don't fit this
  // facility's type, but a direct API call could still send one. This
  // is the actual enforcement — same pattern as restrictClinicalScope,
  // where the UI hiding a tab is a courtesy, not the boundary.
  const orgProfile = await OrganizationProfile.findOne({
    accountId: organizationId,
  })
    .select("organizationType clinicalScope organizationName")
    .lean();

  if (
    !isRoleAllowed({
      organizationType: orgProfile?.organizationType,
      clinicalScope: orgProfile?.clinicalScope,
      membershipRole,
    })
  ) {
    throw new AppError(
      "This role isn't available for your facility type",
      422,
      "ROLE_NOT_IN_CATALOG",
    );
  }

  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const invite = await TeamInvite.create({
    organizationId,
    token,
    email,
    fullName,
    membershipRole,
    expiresAt,
  });

  await sendTeamInviteEmail({
    email,
    fullName,
    organizationName: orgProfile?.organizationName,
    membershipRole,
    token,
  });

  return {
    inviteId: invite._id,
    token: invite.token,
    email: invite.email,
    fullName: invite.fullName,
    membershipRole: invite.membershipRole,
  };
};

export const suspendTeamMemberService = async ({ organizationId, membershipId }) => {
  const membership = await OrganizationMembership.findOne({
    _id: membershipId,
    organizationId,
  });
  if (!membership) {
    throw new AppError("Team member not found", 404, "MEMBER_NOT_FOUND");
  }

  membership.isActive = false;
  await membership.save();

  return { membershipId: membership._id, status: "suspended" };
};

export const reactivateTeamMemberService = async ({ organizationId, membershipId }) => {
  const membership = await OrganizationMembership.findOne({
    _id: membershipId,
    organizationId,
  });
  if (!membership) {
    throw new AppError("Team member not found", 404, "MEMBER_NOT_FOUND");
  }

  membership.isActive = true;
  await membership.save();

  return { membershipId: membership._id, status: "active" };
};

export const getInviteByTokenService = async ({ token }) => {
  const invite = await TeamInvite.findOne({ token, status: "pending" });
  if (!invite || invite.expiresAt < new Date()) {
    throw new AppError("Invalid or expired invite link", 404, "INVITE_NOT_FOUND");
  }

  return {
    email: invite.email,
    fullName: invite.fullName,
    membershipRole: invite.membershipRole,
  };
};

export const acceptInviteService = async ({ token, password }) => {
  const invite = await TeamInvite.findOne({ token, status: "pending" });
  if (!invite || invite.expiresAt < new Date()) {
    throw new AppError("Invalid or expired invite link", 404, "INVITE_NOT_FOUND");
  }

  return withTransaction(async (session) => {
    let account = await Account.findOne({ email: invite.email });
    if (!account) {
      [account] = await Account.create(
        [
          {
            accountType: "user",
            role: toAccountRole(invite.membershipRole),
            email: invite.email,
            password: password,
            isActive: true,
            status: "active",
            isVerified: true,
          },
        ],
        { session },
      );
    }

    let profile = await UserProfile.findOne({ accountId: account._id });
    if (!profile) {
      [profile] = await UserProfile.create(
        [
          {
            accountId: account._id,
            fullName: invite.fullName,
            email: invite.email,
          },
        ],
        { session },
      );
    }

    await OrganizationMembership.create(
      [
        {
          organizationId: invite.organizationId,
          userId: profile._id,
          membershipRole: invite.membershipRole,
          isActive: true,
        },
      ],
      { session },
    );

    invite.status = "accepted";
    await invite.save({ session });

    return { success: true, organizationId: invite.organizationId, fullName: invite.fullName };
  }).then(async (result) => {
    // Fires after the transaction commits — notification creation
    // isn't part of the atomic invite-acceptance guarantee, and
    // shouldn't roll back a successful account creation if it fails.
    try {
      await createNotification({
        recipientAccountId: result.organizationId,
        type: "team_invite_accepted",
        title: "Invite accepted",
        body: `${result.fullName} has accepted your team invitation and can now log in.`,
      });
    } catch (err) {
      console.error("Could not create invite-accepted notification:", err);
    }
    return { success: true };
  });
};
