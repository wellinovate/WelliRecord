import crypto from "crypto";
import { AppError } from "../../shared/errors/AppError.js";
import { OrganizationMembership } from "../memberships/organization_membership_model.js";
import { UserProfile } from "../users/user_profile_model.js";
import { Account } from "../accounts/account_model.js";
import { TeamInvite } from "./team_invite_model.js";
import { withTransaction } from "../../shared/utils/withTransaction.js";

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
      permissions: [],
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
    permissions: [],
    status: "invited",
    lastActive: null,
  }));

  return [...memberList, ...inviteList];
};

export const inviteTeamMemberService = async ({ organizationId, payload }) => {
  const { email, fullName, membershipRole } = payload;
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
            role: invite.membershipRole,
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

    return { success: true };
  });
};
