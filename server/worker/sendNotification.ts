/**
 * Unified notification dispatcher.
 * Supports SMS (Termii), WhatsApp (Termii), and Expo Push.
 * Every send is written to NotificationLog — the rules engine
 * reads this log to decide on escalation; it never touches clinical data.
 */

import mongoose from 'mongoose';
import { NotificationLog, User, Account } from '../models';

const TERMII_API_KEY = process.env.TERMII_API_KEY || '';
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface SendOptions {
  eventId?: mongoose.Types.ObjectId;
  templateType?: string;
  requiresResponse?: boolean;
  channel?: 'sms' | 'whatsapp' | 'push';
}

/** Normalise Nigerian phone numbers to international format */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('234')) return `+${digits}`;
  if (digits.startsWith('0')) return `+234${digits.slice(1)}`;
  return `+${digits}`;
}

/** Send an Expo push notification to all registered push tokens for a patient */
async function sendPush(
  patientId: mongoose.Types.ObjectId,
  message: string,
): Promise<boolean> {
  try {
    // Collect push tokens from both User and Account (either may hold them)
    const [user, account] = await Promise.all([
      User.findById(patientId).select('pushTokens').lean(),
      Account.findOne({ $or: [{ userId: patientId }, { _id: patientId }] })
        .select('pushTokens')
        .lean(),
    ]);

    const tokens: string[] = [
      ...((user as any)?.pushTokens ?? []),
      ...((account as any)?.pushTokens ?? []),
    ].filter((t: string) => t?.startsWith('ExponentPushToken'));

    if (tokens.length === 0) return false;

    const messages = tokens.map((to) => ({
      to,
      title: 'WelliRecord',
      body: message,
      sound: 'default',
    }));

    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
    return res.ok;
  } catch (err) {
    console.error('[Push] Error:', err);
    return false;
  }
}

/** Send SMS via Termii */
async function sendSms(
  phone: string,
  message: string,
  channel: 'sms' | 'whatsapp' = 'sms',
): Promise<boolean> {
  if (!TERMII_API_KEY || TERMII_API_KEY === 'TL_TEST_KEY') {
    console.log(`[SMS:mock] → ${phone}: ${message}`);
    return true; // treat as success in dev
  }
  try {
    const res = await fetch('https://api.ng.termii.com/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: TERMII_API_KEY,
        to: phone,
        from: 'WelliRecord',
        sms: message,
        type: 'plain',
        channel: channel === 'whatsapp' ? 'whatsapp' : 'dnd',
      }),
    });
    const data = await res.json();
    return data.code === 'ok' || data.message?.includes('Successfully');
  } catch (err) {
    console.error('[Termii] Error:', err);
    return false;
  }
}

/**
 * Primary export — called by rules.ts action handlers.
 * Resolves the patient's phone/push tokens, dispatches via all available
 * channels, and writes a NotificationLog document.
 */
export async function sendNotification(
  patientId: mongoose.Types.ObjectId,
  message: string,
  opts: SendOptions = {},
): Promise<void> {
  const { eventId, templateType, requiresResponse = false, channel = 'sms' } = opts;

  // Resolve patient phone from User or Account
  const [user, account] = await Promise.all([
    User.findById(patientId).select('phoneNumber pushTokens').lean(),
    Account.findOne({ $or: [{ userId: patientId }, { _id: patientId }] })
      .select('phone phoneNumber pushTokens')
      .lean(),
  ]);

  const rawPhone =
    (user as any)?.phoneNumber ||
    (account as any)?.phone ||
    (account as any)?.phoneNumber ||
    '';

  let delivered = false;

  // 1. Push (preferred — instant, free, works in-app)
  const pushOk = await sendPush(patientId, message);
  if (pushOk) delivered = true;

  // 2. SMS / WhatsApp fallback
  if (rawPhone) {
    const normalised = normalizePhone(rawPhone);
    const smsOk = await sendSms(normalised, message, channel as 'sms' | 'whatsapp');
    if (smsOk) delivered = true;
  }

  // Always log — even on failure — for NDPR audit trail
  await NotificationLog.create({
    patientId,
    eventId,
    channel: pushOk ? 'push' : rawPhone ? channel : 'push',
    templateType,
    content: message,
    requiresResponse,
    status: 'sent',
  });

  if (!delivered) {
    console.warn(`[Notification] No channel delivered for patient ${patientId}`);
  }
}
