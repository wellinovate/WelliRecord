import {
  listNotificationsService,
  getUnreadCountService,
  markAsReadService,
  markAllAsReadService,
  sendCriticalAlertSmsService,
  listTemplatesService,
  toggleTemplateService,
  getDeliverySummaryService,
} from "./notification_services.js";

export const listNotificationsController = async (req, res, next) => {
  try {
    const accountId = req.user.sub;
    const { page, limit } = req.query;
    const result = await listNotificationsService({
      accountId,
      page: Number(page) || 1,
      limit: Number(limit) || 20,
    });
    return res.status(200).json({ success: true, message: "Notifications retrieved", data: result });
  } catch (error) {
    next(error);
  }
};

export const getUnreadCountController = async (req, res, next) => {
  try {
    const accountId = req.user.sub;
    const result = await getUnreadCountService({ accountId });
    return res.status(200).json({ success: true, message: "Unread count retrieved", data: result });
  } catch (error) {
    next(error);
  }
};

export const markAsReadController = async (req, res, next) => {
  try {
    const accountId = req.user.sub;
    const { notificationId } = req.params;
    const result = await markAsReadService({ accountId, notificationId });
    return res.status(200).json({ success: true, message: "Marked as read", data: result });
  } catch (error) {
    next(error);
  }
};

export const markAllAsReadController = async (req, res, next) => {
  try {
    const accountId = req.user.sub;
    const result = await markAllAsReadService({ accountId });
    return res.status(200).json({ success: true, message: "All marked as read", data: result });
  } catch (error) {
    next(error);
  }
};

export const sendCriticalAlertSmsController = async (req, res, next) => {
  try {
    const result = await sendCriticalAlertSmsService(req.validated);
    return res.status(200).json({ success: true, message: "Alert sent", data: result });
  } catch (error) {
    next(error);
  }
};

export const listTemplatesController = async (req, res, next) => {
  try {
    const { channel } = req.query;
    const result = await listTemplatesService({ channel });
    return res.status(200).json({ success: true, message: "Templates retrieved", data: result });
  } catch (error) {
    next(error);
  }
};

export const toggleTemplateController = async (req, res, next) => {
  try {
    const accountId = req.user.sub;
    const { templateId } = req.params;
    const result = await toggleTemplateService({ templateId, accountId });
    return res.status(200).json({ success: true, message: "Template updated", data: result });
  } catch (error) {
    next(error);
  }
};

export const getDeliverySummaryController = async (req, res, next) => {
  try {
    const result = await getDeliverySummaryService();
    return res.status(200).json({ success: true, message: "Delivery summary retrieved", data: result });
  } catch (error) {
    next(error);
  }
};
