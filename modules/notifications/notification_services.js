import { AppError } from "../../shared/errors/AppError.js";
import { Notification } from "./notification_model.js";
import { NotificationTemplate } from "./notification_template_model.js";
import { DeliveryLog } from "./delivery_log_model.js";
import { sendSms } from "../../shared/utils/termii.js";

// Reusable by any module — this is how the rest of the backend creates
// an in-app notification for a user. Not exposed as its own route;
// called directly from other services (e.g. team invite acceptance).
export const createNotification = async ({
  recipientAccountId,
  type,
  title,
  body,
  link = null,
}) => {
  return Notification.create({ recipientAccountId, type, title, body, link });
};

export const listNotificationsService = async ({ accountId, page = 1, limit = 20 }) => {
  const skip = (page - 1) * limit;
  const [items, total, unreadCount] = await Promise.all([
    Notification.find({ recipientAccountId: accountId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Notification.countDocuments({ recipientAccountId: accountId }),
    Notification.countDocuments({ recipientAccountId: accountId, isRead: false }),
  ]);

  return {
    items,
    unreadCount,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

export const getUnreadCountService = async ({ accountId }) => {
  const unreadCount = await Notification.countDocuments({
    recipientAccountId: accountId,
    isRead: false,
  });
  return { unreadCount };
};

export const markAsReadService = async ({ accountId, notificationId }) => {
  const notification = await Notification.findOne({
    _id: notificationId,
    recipientAccountId: accountId,
  });
  if (!notification) {
    throw new AppError("Notification not found", 404, "NOTIFICATION_NOT_FOUND");
  }
  notification.isRead = true;
  await notification.save();
  return notification;
};

export const markAllAsReadService = async ({ accountId }) => {
  const result = await Notification.updateMany(
    { recipientAccountId: accountId, isRead: false },
    { $set: { isRead: true } },
  );
  return { modifiedCount: result.modifiedCount };
};

// ── Critical alert SMS ──
export const sendCriticalAlertSmsService = async ({ phoneNumber, message }) => {
  try {
    await sendSms({ phoneNumber, message });
    await DeliveryLog.create({
      channel: "sms",
      status: "sent",
      recipient: phoneNumber,
      context: "critical_lab_alert",
    });
    return { success: true };
  } catch (error) {
    await DeliveryLog.create({
      channel: "sms",
      status: "failed",
      recipient: phoneNumber,
      context: "critical_lab_alert",
      errorMessage: error?.message || "Unknown error",
    });
    throw new AppError(
      "Critical alert SMS failed to send",
      502,
      "CRITICAL_ALERT_SMS_FAILED",
    );
  }
};

// ── Templates ──

const DEFAULT_TEMPLATES = [
  {
    name: "OTP Verification",
    channel: "sms",
    body: "Your WelliRecord verification code is {{otp}}. Valid for 10 minutes. Do not share with anyone.",
    variables: ["otp"],
  },
  {
    name: "Consent Request Notification",
    channel: "sms",
    body: "{{provider_name}} from {{org_name}} has requested access to your WelliRecord. Log in to approve or decline: {{link}}",
    variables: ["provider_name", "org_name", "link"],
  },
  {
    name: "Welcome Email",
    channel: "email",
    subject: "Welcome to WelliRecord — Your Health Vault is Ready",
    body: "Hi {{name}},\n\nWelcome to WelliRecord. Your secure personal health vault has been created.\n\n{{cta_link}}",
    variables: ["name", "cta_link"],
  },
  {
    name: "Appointment Reminder",
    channel: "whatsapp",
    body: "Hi {{patient_name}}, this is a reminder that you have an appointment with {{provider_name}} at {{org_name}} on {{date}} at {{time}}.",
    variables: ["patient_name", "provider_name", "org_name", "date", "time"],
  },
  {
    name: "Lab Result Ready",
    channel: "sms",
    body: "Your lab results from {{org_name}} are now available in your WelliRecord. Log in to view: {{link}}",
    variables: ["org_name", "link"],
  },
];

export const seedDefaultTemplates = async () => {
  const count = await NotificationTemplate.countDocuments();
  if (count === 0) {
    await NotificationTemplate.insertMany(
      DEFAULT_TEMPLATES.map((t) => ({ ...t, isActive: true })),
    );
  }
};

export const listTemplatesService = async ({ channel }) => {
  const filter = channel ? { channel } : {};
  return NotificationTemplate.find(filter).sort({ name: 1 });
};

export const toggleTemplateService = async ({ templateId, accountId }) => {
  const template = await NotificationTemplate.findById(templateId);
  if (!template) {
    throw new AppError("Template not found", 404, "TEMPLATE_NOT_FOUND");
  }
  template.isActive = !template.isActive;
  template.lastModifiedBy = accountId;
  await template.save();
  return template;
};

export const getDeliverySummaryService = async () => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const logs = await DeliveryLog.aggregate([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: { channel: "$channel", status: "$status" },
        count: { $sum: 1 },
      },
    },
  ]);

  const summary = {
    sms: { sent: 0, failed: 0 },
    email: { sent: 0, failed: 0 },
    whatsapp: { sent: 0, failed: 0 },
    in_app: { sent: 0, failed: 0 },
  };

  for (const row of logs) {
    const { channel, status } = row._id;
    if (summary[channel]) {
      summary[channel][status] = row.count;
    }
  }

  return {
    last30Days: Object.fromEntries(
      Object.entries(summary).map(([channel, { sent, failed }]) => [
        channel,
        {
          sent: sent + failed,
          delivered: sent,
          failed,
          deliveryRate: sent + failed > 0 ? Math.round((sent / (sent + failed)) * 1000) / 10 : null,
        },
      ]),
    ),
    note: "Reflects real send attempts logged through this system since it was built — earlier sends made before this module existed aren't included.",
  };
};
