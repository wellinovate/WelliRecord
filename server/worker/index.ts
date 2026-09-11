/**
 * Worker entry point — runs on a separate Render Background Worker dyno.
 * Connects to MongoDB, starts the event processor and scheduler.
 * Never serves HTTP traffic.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { startEventProcessor } from './eventProcessor';
import { startScheduler } from './scheduler';

const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/wellirecord';

async function main() {
  console.log('[Worker] Connecting to MongoDB…');
  await mongoose.connect(MONGODB_URI);
  console.log('[Worker] Connected. Starting event processor and scheduler.');
  startEventProcessor();
  startScheduler();
  console.log('[Worker] Running. Press Ctrl+C to stop.');
}

main().catch((err) => {
  console.error('[Worker] Fatal startup error:', err);
  process.exit(1);
});
