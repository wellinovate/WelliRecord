/**
 * Scheduler — time-based triggers that are not tied to a write.
 * Runs as a separate Render Background Worker.
 *
 * All cron jobs emit into the Event outbox, so the rules engine
 * gets one consistent input regardless of whether a trigger was
 * a write (post-save hook) or a schedule.
 */

import cron from 'node-cron';
import { subHours, subDays, differenceInMonths } from 'date-fns';
import mongoose from 'mongoose';
import { Event, NotificationLog, User, Account, HealthRecord } from '../models';
import preventiveCareSchedule from '../config/preventiveCareSchedule';

// ── Appointment Reminders ────────────────────────────────────────────────────
// Runs every 15 minutes. Finds appointments in 30min / 3h / 24h windows
// and emits appointment.reminder_due into the outbox.
async function checkUpcomingAppointments(): Promise<void> {
  const now = new Date();
  const windows = [
    { label: '30min', from: subHours(now, 0), to: new Date(now.getTime() + 30 * 60 * 1000), hoursUntil: 0.5 },
    { label: '3h',    from: new Date(now.getTime() + 2.5 * 3600 * 1000), to: new Date(now.getTime() + 3.5 * 3600 * 1000), hoursUntil: 3 },
    { label: '24h',   from: new Date(now.getTime() + 23 * 3600 * 1000), to: new Date(now.getTime() + 25 * 3600 * 1000), hoursUntil: 24 },
  ];

  for (const window of windows) {
    // HealthRecord type 'Appointment' holds appointment date in the `date` field
    const appointments = await HealthRecord.find({
      type: 'Appointment',
      'appointmentDate': { $gte: window.from, $lte: window.to },
    }).lean();

    for (const appt of appointments) {
      // Deduplicate — don't re-emit if we already sent this reminder window
      const alreadySent = await Event.exists({
        type: 'appointment.reminder_due',
        sourceId: appt._id,
        'payload.window': window.label,
      });
      if (alreadySent) continue;

      await Event.create({
        type: 'appointment.reminder_due',
        patientId: appt.userId,
        sourceCollection: 'healthrecords',
        sourceId: appt._id,
        payload: {
          window: window.label,
          hoursUntil: window.hoursUntil,
          facility: (appt as any).provider || 'your appointment',
        },
      });
    }
  }
}

// ── Follow-up Reminders ──────────────────────────────────────────────────────
// Runs daily at 06:00. Checks for encounters 1, 7, and 30 days ago.
async function checkFollowUpWindows(): Promise<void> {
  const now = new Date();
  const checkDays = [1, 7, 30];

  for (const day of checkDays) {
    const windowStart = subDays(now, day + 1);
    const windowEnd   = subDays(now, day);

    const encounters = await HealthRecord.find({
      type: { $in: ['Visit', 'Encounter', 'Consultation'] },
      createdAt: { $gte: windowStart, $lte: windowEnd },
    }).lean();

    for (const enc of encounters) {
      const alreadySent = await Event.exists({
        type: 'followup.reminder_due',
        sourceId: enc._id,
        'payload.daysSince': day,
      });
      if (alreadySent) continue;

      await Event.create({
        type: 'followup.reminder_due',
        patientId: enc.userId,
        sourceCollection: 'healthrecords',
        sourceId: enc._id,
        payload: { daysSince: day },
      });
    }
  }
}

// ── Preventive Care Due Dates ─────────────────────────────────────────────────
// Runs daily at 06:00. Evaluates the static schedule against each patient's
// profile and last recorded care event.
async function checkPreventiveCareSchedules(): Promise<void> {
  // Only process accounts with a known date of birth
  const accounts = await Account.find({
    $or: [{ dateOfBirth: { $exists: true } }, { dob: { $exists: true } }],
  })
    .select('_id userId phone dateOfBirth dob sex gender')
    .lean();

  for (const account of accounts) {
    const dob = (account as any).dateOfBirth || (account as any).dob;
    if (!dob) continue;

    const age = differenceInMonths(new Date(), new Date(dob)) / 12;
    const sex = ((account as any).sex || (account as any).gender || '').toLowerCase();
    const patientId = (account as any).userId || (account as any)._id;

    for (const rule of preventiveCareSchedule) {
      if (rule.intervalMonths === 0) continue; // one-time vaccines handled separately
      if (!rule.appliesIf({ age, sex })) continue;

      // Find the most recent Event for this care type for this patient
      const lastEvent = await Event.findOne({
        type: 'preventivecare.reminder_due',
        patientId,
        'payload.careId': rule.id,
      })
        .sort({ createdAt: -1 })
        .lean();

      const monthsSinceLast = lastEvent
        ? differenceInMonths(new Date(), new Date((lastEvent as any).createdAt))
        : rule.intervalMonths + 1; // never sent → treat as overdue

      if (monthsSinceLast >= rule.intervalMonths) {
        await Event.create({
          type: 'preventivecare.reminder_due',
          patientId,
          sourceCollection: 'accounts',
          sourceId: (account as any)._id,
          payload: { careId: rule.id, label: rule.label },
        });
      }
    }
  }
}

// ── No-Response Escalation ────────────────────────────────────────────────────
// Runs hourly. Flips sent → no_response after 24h with no reply.
// The medication rule's missedCount query then picks this up automatically.
async function markNoResponseLogs(): Promise<void> {
  const cutoff = subHours(new Date(), 24);
  const result = await NotificationLog.updateMany(
    {
      status: 'sent',
      requiresResponse: true,
      sentAt: { $lt: cutoff },
    },
    { $set: { status: 'no_response' } },
  );
  if (result.modifiedCount > 0) {
    console.log(`[Scheduler] Marked ${result.modifiedCount} notification(s) as no_response`);
  }
}

// ── Start All Schedules ───────────────────────────────────────────────────────
export function startScheduler(): void {
  console.log('[Scheduler] Started');

  // Appointment reminders — every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    try { await checkUpcomingAppointments(); }
    catch (err: any) { console.error('[Scheduler] appointment check error:', err.message); }
  });

  // Follow-up and preventive care — daily at 06:00 WAT (UTC+1)
  cron.schedule('0 5 * * *', async () => {
    try { await checkFollowUpWindows(); }
    catch (err: any) { console.error('[Scheduler] followup check error:', err.message); }
  });

  cron.schedule('0 5 * * *', async () => {
    try { await checkPreventiveCareSchedules(); }
    catch (err: any) { console.error('[Scheduler] preventive care check error:', err.message); }
  });

  // No-response escalation — every hour
  cron.schedule('0 * * * *', async () => {
    try { await markNoResponseLogs(); }
    catch (err: any) { console.error('[Scheduler] no-response check error:', err.message); }
  });
}
