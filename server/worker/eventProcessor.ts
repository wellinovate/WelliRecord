/**
 * Event Processor — polls the Event outbox every minute.
 * Picks up to 50 pending events, applies the matching rule,
 * and marks each event processed or failed.
 *
 * Run as a separate Render Background Worker so it cannot be
 * killed by API request timeouts and does not share resources
 * with the web service.
 */

import cron from 'node-cron';
import { Event } from '../models';
import rules from './rules';

async function processEvents(): Promise<void> {
  // Grab a batch of pending events — limit prevents memory spikes
  const events = await Event.find({ status: 'pending' }).limit(50).sort({ createdAt: 1 });
  if (events.length === 0) return;

  console.log(`[EventProcessor] Processing ${events.length} pending event(s)`);

  for (const event of events) {
    // Mark as processing immediately to prevent double-processing
    // if this worker runs overlapping with a previous slow batch
    event.status = 'processing';
    await event.save();

    try {
      const rule = rules[event.type];
      if (rule) {
        const shouldAct = await rule.condition(event);
        if (shouldAct) {
          await rule.action(event);
        }
      } else {
        console.warn(`[EventProcessor] No rule for event type: ${event.type}`);
      }
      event.status = 'processed';
      event.processedAt = new Date();
    } catch (err: any) {
      console.error(`[EventProcessor] Failed event ${event._id} (${event.type}):`, err.message);
      event.status = 'failed';
      event.error = err.message;
    }

    await event.save();
  }
}

/** Poll every minute */
export function startEventProcessor(): void {
  console.log('[EventProcessor] Started — polling every minute');
  cron.schedule('* * * * *', async () => {
    try {
      await processEvents();
    } catch (err: any) {
      console.error('[EventProcessor] Uncaught error:', err.message);
    }
  });
}
