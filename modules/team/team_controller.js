import {
  listTeamMembersService,
  inviteTeamMemberService,
  suspendTeamMemberService,
  reactivateTeamMemberService,
  getInviteByTokenService,
  acceptInviteService,
  getRoleCatalogService,
} from "./team_services.js";

export const getRoleCatalogController = async (req, res, next) => {
  try {
    const organizationId = req.user.sub;
    const result = await getRoleCatalogService({ organizationId });

    return res.status(200).json({
      success: true,
      message: "Role catalog retrieved successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const listTeamMembersController = async (req, res, next) => {
  try {
    const organizationId = req.user.sub;
    const result = await listTeamMembersService({ organizationId });
    return res.status(200).json({
      success: true,
      message: "Team members retrieved successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const inviteTeamMemberController = async (req, res, next) => {
  try {
    const organizationId = req.user.sub;
    const result = await inviteTeamMemberService({
      organizationId,
      payload: req.validated,
    });
    return res.status(201).json({
      success: true,
      message: "Invitation sent successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const suspendTeamMemberController = async (req, res, next) => {
  try {
    const organizationId = req.user.sub;
    const { membershipId } = req.params;
    const result = await suspendTeamMemberService({ organizationId, membershipId });
    return res.status(200).json({
      success: true,
      message: "Team member access suspended",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const reactivateTeamMemberController = async (req, res, next) => {
  try {
    const organizationId = req.user.sub;
    const { membershipId } = req.params;
    const result = await reactivateTeamMemberService({ organizationId, membershipId });
    return res.status(200).json({
      success: true,
      message: "Team member access reactivated",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getInviteByTokenController = async (req, res, next) => {
  try {
    const { token } = req.params;
    const result = await getInviteByTokenService({ token });
    return res.status(200).json({
      success: true,
      message: "Invite details retrieved",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const acceptInviteController = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.validated;
    const result = await acceptInviteService({ token, password });
    return res.status(200).json({
      success: true,
      message: "Invitation accepted successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
