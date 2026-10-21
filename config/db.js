import mongoose from "mongoose";

import dotenv from "dotenv";

dotenv.config();

// Fail fast when no member answers, and re-check the replica set often so a
// failover is noticed in seconds instead of leaving a stale view of the primary.
const OPTIONS = {
  serverSelectionTimeoutMS: 15000,
  heartbeatFrequencyMS: 10000,
  socketTimeoutMS: 45000,
  retryWrites: true,
  retryReads: true,
};

let listening = false;
let watchdog = null;
let failedPings = 0;

// The driver keeps the highest election term it has seen. If the cluster is restored, rebuilt or
// moved so that its term goes back, the driver rejects the real primary as stale ("primary marked
// stale due to electionId/setVersion mismatch") and never recovers on its own. Dropping the client
// and connecting again clears that memory.
async function rebuildConnection() {
  console.warn("[db] rebuilding the connection to clear a stale topology");
  try {
    await mongoose.disconnect();
  } catch (e) {
    console.error("[db] disconnect failed:", e?.message);
  }
  failedPings = 0;
  await connectDB();
}

function startWatchdog() {
  if (watchdog) return;
  watchdog = setInterval(async () => {
    if (mongoose.connection.readyState !== 1) return;
    try {
      await mongoose.connection.db.admin().ping();
      failedPings = 0;
    } catch (e) {
      failedPings += 1;
      console.warn(`[db] ping failed (${failedPings}):`, e?.message);
      if (failedPings >= 3) rebuildConnection();
    }
  }, 20000);
  watchdog.unref?.();
}

const connectDB = async (attempt = 1) => {
  if (!listening) {
    listening = true;
    mongoose.connection.on("disconnected", () => console.warn("[db] disconnected"));
    mongoose.connection.on("reconnected", () => console.log("[db] reconnected"));
    mongoose.connection.on("error", (e) => console.error("[db] error:", e?.message));
  }
  try {
    await mongoose.connect(process.env.DATABASE, OPTIONS);
    console.log("DB connected...");
    startWatchdog();
  } catch (error) {
    console.error(`[db] connect attempt ${attempt} failed:`, error?.message);
    // Keep trying instead of leaving the server up with no database.
    if (attempt < 10) setTimeout(() => connectDB(attempt + 1), Math.min(attempt * 3000, 15000));
  }
};

export default connectDB;
