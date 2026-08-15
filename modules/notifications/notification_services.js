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
    // Separate row from the whatsapp one above, same name — this is
    // the channel actually implemented today (see sendReminder,
    // appointment_notifications.js). WhatsApp has no BSP wired up yet
    // (see releaseLabDeliveryService), so that row stays as a
    // placeholder for when it does.
    name: "Appointment Reminder",
    channel: "sms",
    body: "Reminder: you have an appointment at {{org_name}} today at {{time}}. Reply if you need to reschedule.",
    variables: ["org_name", "time"],
  },
  {
    // Matches notifyAppointmentBooked's in-app notification.
    name: "Appointment Confirmation",
    channel: "in_app",
    body: "Your appointment at {{org_name}}{{provider_suffix}} is booked for {{datetime}}.",
    variables: ["org_name", "provider_suffix", "datetime"],
  },
  {
    name: "Lab Result Ready",
    channel: "sms",
    body: "Your lab results are now available in your WelliRecord. Log in to view: {{link}}",
    variables: ["link"],
  },
  {
    // Distinct from "Lab Result Ready" so a facility can toggle
    // routine result notifications off while keeping critical alerts
    // on (or vice versa) — they're different urgency, not just
    // different wording of the same message.
    name: "Critical Lab Alert",
    channel: "sms",
    body: "Urgent: a critical lab result has been released to your WelliRecord. Log in now: {{link}}",
    variables: ["link"],
  },
];

export const seedDefaultTemplates = async () => {
  // Upserts by (name, channel) rather than bailing out once any
  // template exists. A plain "insert only if collection is empty"
  // check meant that adding a new template to DEFAULT_TEMPLATES here
  // (as happened when Appointment Confirmation, the sms-channel
  // Appointment Reminder, and Critical Lab Alert were added) would
  // never actually create those rows on a database that already had
  // the original 5 — resolveTemplatedMessage would find nothing and
  // fail closed, silently breaking confirmations and reminders on
  // every existing deployment. $setOnInsert leaves any row an admin
  // has already edited (body, isActive) untouched.
  await Promise.all(
    DEFAULT_TEMPLATES.map((t) =>
      NotificationTemplate.updateOne(
        { name: t.name, channel: t.channel },
        { $setOnInsert: { ...t, isActive: true } },
        { upsert: true },
      ),
    ),
  );
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

// ── Template-driven message resolution ──
//
// Renders {{variable}} placeholders in a template's body/subject
// against real values. Unresolved placeholders are left as-is rather
// than silently blanked, so a missing variable is visible in the
// rendered output instead of vanishing.
const renderPlaceholders = (text, variables) =>
  text.replace(/{{\s*(\w+)\s*}}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(variables, key)
      ? String(variables[key] ?? "")
      : match,
  );

// The single place every real send should go through to decide
// whether, and with what content, to send — instead of each call site
// carrying its own hardcoded string with no connection to the
// admin-editable NotificationTemplate row of the same name/channel.
// Deliberately distinguishes "explicitly deactivated" from "no
// matching template row" — those are different situations:
//   - deactivated: an admin made a deliberate choice. Honor it, don't
//     send, that's the entire point of the toggle.
//   - missing: a config/seeding gap, not a decision. Silently
//     skipping is the wrong failure mode for anything time-sensitive
//     or safety-relevant, so callers that can't tolerate silent loss
//     (e.g. a critical lab alert) should pass safetyNetBody so a
//     missing row degrades to a known-good message instead of nothing.
//     Callers where silence is an acceptable failure (a routine
//     reminder) should leave it unset and fail closed either way.
export const resolveTemplatedMessage = async ({
  name,
  channel,
  variables = {},
  safetyNetBody = null,
}) => {
  const template = await NotificationTemplate.findOne({ name, channel });

  if (template && !template.isActive) {
    return { send: false, reason: "deactivated" };
  }

  if (!template) {
    if (safetyNetBody) {
      return { send: true, body: safetyNetBody, reason: "missing_template_fallback" };
    }
    return { send: false, reason: "missing_template" };
  }

  return {
    send: true,
    body: renderPlaceholders(template.body, variables),
    subject: template.subject ? renderPlaceholders(template.subject, variables) : null,
    reason: "template",
  };
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
