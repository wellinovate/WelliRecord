import {
  importLocalCustomersService,
  getLocalCustomersService,
  getLocalCustomerStatsService,
  confirmMatchService,
  dismissMatchService,
  sendInvitationService,
  bulkSendInvitationsService,
  getClaimInfoService,
  claimRecordService,
} from "./local_customer_service.js";

export const importLocalCustomersController = async (req, res, next) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, message: "rows must be a non-empty array" });
    }
    if (rows.length > 5000) {
      return res.status(400).json({ success: false, message: "Maximum 5,000 rows per import" });
    }
    const result = await importLocalCustomersService({ rows, authUser: req.user });
    return res.status(200).json({ success: true, message: "Import complete", data: result });
  } catch (error) {
    next(error);
  }
};

export const getLocalCustomersController = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, matchStatus, invitationStatus, search } = req.query;
    const result = await getLocalCustomersService({
      page: Number(page),
      limit: Math.min(Number(limit), 100),
      matchStatus,
      invitationStatus,
      search,
      authUser: req.user,
    });
    return res.status(200).json({ success: true, message: "Customers fetched", data: result });
  } catch (error) {
    next(error);
  }
};

export const getLocalCustomerStatsController = async (req, res, next) => {
  try {
    const result = await getLocalCustomerStatsService({ authUser: req.user });
    return res.status(200).json({ success: true, message: "Stats fetched", data: result });
  } catch (error) {
    next(error);
  }
};

export const confirmMatchController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: "userId is required" });
    }
    const result = await confirmMatchService({ id, userId, authUser: req.user });
    return res.status(200).json({ success: true, message: "Match confirmed", data: result });
  } catch (error) {
    next(error);
  }
};

export const dismissMatchController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await dismissMatchService({ id });
    return res.status(200).json({ success: true, message: "Match dismissed", data: result });
  } catch (error) {
    next(error);
  }
};

export const sendInvitationController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await sendInvitationService({ id, authUser: req.user });
    return res.status(200).json({ success: true, message: "Invitation generated", data: result });
  } catch (error) {
    next(error);
  }
};

export const bulkSendInvitationsController = async (req, res, next) => {
  try {
    const { ids } = req.body;
    const result = await bulkSendInvitationsService({ ids, authUser: req.user });
    return res.status(200).json({ success: true, message: "Bulk invitations generated", data: result });
  } catch (error) {
    next(error);
  }
};

export const getClaimInfoController = async (req, res, next) => {
  try {
    const { token } = req.params;
    const result = await getClaimInfoService({ token });
    return res.status(200).json({ success: true, message: "Claim info retrieved", data: result });
  } catch (error) {
    next(error);
  }
};

export const claimRecordController = async (req, res, next) => {
  try {
    const { token } = req.params;
    const result = await claimRecordService({ token, authUser: req.user });
    return res.status(200).json({ success: true, message: "Record claimed successfully", data: result });
  } catch (error) {
    next(error);
  }
};
