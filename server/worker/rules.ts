/**
 * Rules engine — deterministic decision table.
 * AI (Gemini/Claude) is ONLY called to generate message text after
 * the rule has already decided to act. It has no write path to
 * clinical data and no role in the condition evaluation.
 */

import mongoose from 'mongoose';
import { subDays } from 'date-fns';
import { NotificationLog, IEvent } from '../models';
import { sendNotification } from './sendNotification';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

/** Optional AI-generated message text, constrained by a strict template prompt.
 *  Falls back to a hardcoded string if the API is unavailable. */
async function generateMessage(
  templateKey: string,
  event: IEvent,
  fallback: string,
): Promise<string> {
  if (!ANTHROPIC_API_KEY) return fallback;
  try {
    const prompts: Record<string, string> = {
      lab_critical: `Write a brief (max 2 sentences), calm, professional SMS to a Nigerian patient whose lab result has a critical value. 
Do NOT mention specific values or diagnoses. Tell them their result needs urgent attention and to call their doctor or visit the nearest facility. 
Respond with ONLY the SMS text, no preamble.`,
      lab_normal: `Write a brief (1 sentence) SMS to a Nigerian patient notifying them that their laboratory result is now available in WelliRecord. 
Respond with ONLY the SMS text.`,
    };
    const prompt = prompts[templateKey];
    if (!prompt) return fallback;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 120,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    const text = data?.content?.[0]?.text?.trim();
    return text || fallback;
  } catch {
    return fallback;
  }
}

interface Rule {
  condition: (event: IEvent) => Promise<boolean>;
  action: (event: IEvent) => Promise<void>;
}

const rules: Record<string, Rule> = {

  // ── Lab Results ────────────────────────────────────────────────────────────
  'labresult.uploaded': {
    condition: async () => true,
    action: async (event) => {
      const isCritical = event.payload?.critical === true;
      const message = isCritical
        ? await generateMessage(
            'lab_critical',
            event,
            'Your WelliRecord lab result requires urgent attention. Please contact your doctor or visit the nearest facility.',
          )
        : await generateMessage(
            'lab_normal',
            event,
            'Your laboratory result is now available in your WelliRecord.',
          );
      await sendNotification(event.patientId, message, {
        eventId: event._id as mongoose.Types.ObjectId,
        templateType: 'lab_result',
        requiresResponse: false,
      });
    },
  },

  // ── Medication Reminders ───────────────────────────────────────────────────
  'medication.reminder_due': {
    condition: async () => true,
    action: async (event) => {
      const missedCount = await NotificationLog.countDocuments({
        patientId: event.patientId,
        templateType: 'medication_reminder',
        status: 'no_response',
        sentAt: { $gte: subDays(new Date(), 7) },
      });

      const message =
        missedCount >= 3
          ? "You've missed several medication reminders this week. Would you like help reviewing your medication schedule? Reply YES to confirm or STOP to opt out."
          : "It's time for your medication. Please take it as prescribed. Reply DONE when taken.";

      await sendNotification(event.patientId, message, {
        eventId: event._id as mongoose.Types.ObjectId,
        templateType: 'medication_reminder',
        requiresResponse: true,
      });
    },
  },

  // ── Appointment Reminders ──────────────────────────────────────────────────
  'appointment.reminder_due': {
    condition: async () => true,
    action: async (event) => {
      const hoursUntil = event.payload?.hoursUntil ?? 24;
      const facility = event.payload?.facility ?? 'your appointment';
      const timeLabel =
        hoursUntil <= 1
          ? 'in 30 minutes'
          : hoursUntil <= 3
          ? 'in 3 hours'
          : 'tomorrow';

      const message = `Reminder: You have an appointment at ${facility} ${timeLabel}. Reply CONFIRM to confirm or CANCEL to cancel.`;

      await sendNotification(event.patientId, message, {
        eventId: event._id as mongoose.Types.ObjectId,
        templateType: 'appointment_reminder',
        requiresResponse: true,
      });
    },
  },

  // ── Follow-up Reminders ────────────────────────────────────────────────────
  'followup.reminder_due': {
    condition: async () => true,
    action: async (event) => {
      const daysSince = event.payload?.daysSince ?? 7;
      const message = `It has been ${daysSince} day(s) since your last visit. How are you feeling? Your doctor recommends a follow-up check. Reply OK if you are well, or HELP if you need assistance.`;

      await sendNotification(event.patientId, message, {
        eventId: event._id as mongoose.Types.ObjectId,
        templateType: 'followup_reminder',
        requiresResponse: true,
      });
    },
  },

  // ── Preventive Care ────────────────────────────────────────────────────────
  'preventivecare.reminder_due': {
    condition: async () => true,
    action: async (event) => {
      const careLabel = event.payload?.label ?? 'a preventive care appointment';
      const message = `Your WelliRecord health calendar shows that your ${careLabel} is due. Please schedule an appointment at a convenient facility.`;

      await sendNotification(event.patientId, message, {
        eventId: event._id as mongoose.Types.ObjectId,
        templateType: 'preventive_care',
        requiresResponse: false,
      });
    },
  },

  // ── Health Record Uploaded ─────────────────────────────────────────────────
  'healthrecord.uploaded': {
    condition: async () => true,
    action: async (event) => {
      const recordType = event.payload?.type ?? 'health record';
      const message = `A new ${recordType} has been added to your WelliRecord. Open the app to review it.`;
      await sendNotification(event.patientId, message, {
        eventId: event._id as mongoose.Types.ObjectId,
        templateType: 'record_upload',
        requiresResponse: false,
      });
    },
  },

  // ── Notification Confirmed (audit only — no outbound action needed) ─────────
  'notification.confirmed': {
    condition: async () => false, // no outbound message; already handled by webhook
    action: async () => {},
  },
};

export default rules;
