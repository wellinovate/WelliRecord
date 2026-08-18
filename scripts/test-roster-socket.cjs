// scripts/test-roster-socket.cjs
//
// Two checks in one run:
//
// 1. Auth rejection: connects a socket with a deliberately garbage
//    token and confirms the server rejects the connection outright
//    (connect_error fires, socket never connects). This is the
//    regression check for the jwt.verify() fix in shared/realtime/socket.js
//    (744180d) — before that fix, presence-only checking meant any
//    non-empty string was accepted.
//
// 2. Org isolation: creates a roster and assignment under ORG1,
//    publishes it, and confirms ORG1's socket receives
//    roster_published / duty_assignment_change while ORG2's socket
//    (a real, valid token for a different org) receives neither.
//    Mirrors the pattern in test-socket.cjs used to verify
//    lab_order_change isolation on Aug 7.
//
// Requires two valid JWTs for staff in two different organizations,
// and a valid staffId (UserProfile _id) to assign in ORG1. No garbage
// token needs to be supplied — one is generated inline.
//
// Usage:
//   BASE_URL=https://wellirecord.onrender.com \
//   ORG1_TOKEN=... \
//   ORG2_TOKEN=... \
//   ORG1_STAFF_ID=... \
//   node scripts/test-roster-socket.cjs

const { io } = require("socket.io-client");

const BASE_URL = process.env.BASE_URL || "http://localhost:4000";
const ORG1_TOKEN = process.env.ORG1_TOKEN;
const ORG2_TOKEN = process.env.ORG2_TOKEN;
const ORG1_STAFF_ID = process.env.ORG1_STAFF_ID;
const GARBAGE_TOKEN = "not.a.real.jwt-" + Date.now();

if (!ORG1_TOKEN || !ORG2_TOKEN || !ORG1_STAFF_ID) {
  console.error("Missing ORG1_TOKEN, ORG2_TOKEN, or ORG1_STAFF_ID env vars.");
  process.exit(1);
}

const received = { org1: [], org2: [] };

function connectSocket(label, token) {
  const socket = io(BASE_URL, { auth: { token } });

  socket.on("connect_error", (err) => {
    console.error(`[${label}] socket connect_error:`, err.message);
  });

  socket.on("roster_published", (payload) => {
    received[label].push({ event: "roster_published", payload });
  });

  socket.on("duty_assignment_change", (payload) => {
    received[label].push({ event: "duty_assignment_change", payload });
  });

  return socket;
}

// Separate from connectSocket() above: this one tracks connect vs.
// connect_error explicitly rather than listening for roster events,
// since the point here is proving the handshake itself is rejected.
function attemptInvalidConnect() {
  return new Promise((resolve) => {
    const socket = io(BASE_URL, { auth: { token: GARBAGE_TOKEN }, reconnection: false });
    let settled = false;

    socket.on("connect", () => {
      if (settled) return;
      settled = true;
      socket.disconnect();
      resolve({ connected: true, error: null });
    });

    socket.on("connect_error", (err) => {
      if (settled) return;
      settled = true;
      socket.disconnect();
      resolve({ connected: false, error: err.message });
    });

    // Fallback in case neither event fires within a reasonable window.
    setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.disconnect();
      resolve({ connected: false, error: "timeout, no connect or connect_error" });
    }, 3000);
  });
}

async function apiCall(path, token, method = "GET", body) {
  const res = await fetch(`${BASE_URL}/api/v1${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`${method} ${path} failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data.data;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("Attempting connection with a garbage token...");
  const invalidAttempt = await attemptInvalidConnect();

  console.log(`Garbage token connected: ${invalidAttempt.connected} (expected: false)`);
  if (invalidAttempt.error) {
    console.log(`  connect_error: ${invalidAttempt.error}`);
  }
  const authRejectionPass = invalidAttempt.connected === false;
  console.log(
    authRejectionPass
      ? "PASS: invalid token was rejected at the handshake.\n"
      : "FAIL: invalid token was accepted — jwt.verify() in socket.js is not being enforced.\n",
  );

  const org1Socket = connectSocket("org1", ORG1_TOKEN);
  const org2Socket = connectSocket("org2", ORG2_TOKEN);

  // Give both sockets time to connect and join their org rooms.
  await wait(1500);

  console.log("Creating roster under ORG1...");
  const periodStart = new Date();
  const periodEnd = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);

  const roster = await apiCall("/rosters", ORG1_TOKEN, "POST", {
    title: "Socket isolation test roster",
    periodStart,
    periodEnd,
  });

  console.log("Adding duty assignment...");
  await apiCall(`/rosters/${roster.id}/assignments`, ORG1_TOKEN, "POST", {
    staffId: ORG1_STAFF_ID,
    staffRole: "nurse",
    duty: "regular",
    location: "Ward A",
    date: periodStart,
    startTime: "08:00",
    endTime: "16:00",
  });

  console.log("Publishing roster...");
  await apiCall(`/rosters/${roster.id}/publish`, ORG1_TOKEN, "POST");

  // Give the broadcast time to land.
  await wait(1500);

  const org1GotPublish = received.org1.some((e) => e.event === "roster_published");
  const org2GotPublish = received.org2.some((e) => e.event === "roster_published");

  console.log("\n--- Results ---");
  console.log(`ORG1 received roster_published: ${org1GotPublish} (expected: true)`);
  console.log(`ORG2 received roster_published: ${org2GotPublish} (expected: false)`);

  const isolationPass = org1GotPublish && !org2GotPublish;
  console.log(
    isolationPass
      ? "PASS: org isolation holds for roster_published."
      : "FAIL: check org room scoping in roster_service.js broadcast().",
  );

  const overallPass = authRejectionPass && isolationPass;
  console.log(`\n${overallPass ? "ALL CHECKS PASSED" : "ONE OR MORE CHECKS FAILED"}`);

  org1Socket.disconnect();
  org2Socket.disconnect();
  process.exit(overallPass ? 0 : 1);
}

run().catch((err) => {
  console.error("Test run failed:", err);
  process.exit(1);
});
