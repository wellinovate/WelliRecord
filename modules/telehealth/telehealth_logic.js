export const VISIT_TYPES = ["in_person", "virtual"];
export const DEFAULT_DURATION_MIN = 30;
const OPEN_BEFORE_MS = 10 * 60_000;
const CLOSE_AFTER_END_MS = 60 * 60_000;

export const roomNameFor = (appointmentId) => `wr-web-${appointmentId}`;

export function cleanVisitFields({ visitType, durationMin } = {}) {
  const out = {};
  if (visitType !== undefined) {
    if (!VISIT_TYPES.includes(visitType)) return { ok: false, message: "visitType must be in_person or virtual." };
    out.visitType = visitType;
  }
  if (durationMin !== undefined && durationMin !== null && durationMin !== "") {
    const n = Number(durationMin);
    if (!Number.isInteger(n) || n < 5 || n > 240) return { ok: false, message: "durationMin must be a whole number from 5 to 240." };
    out.durationMin = n;
  }
  return { ok: true, value: out };
}

/** Open from 10 minutes before the start until an hour after the end. */
export function joinWindow(scheduledFor, durationMin, nowMs = Date.now()) {
  const start = new Date(scheduledFor).getTime();
  const opensAt = new Date(start - OPEN_BEFORE_MS);
  const closesAt = new Date(start + (durationMin || DEFAULT_DURATION_MIN) * 60_000 + CLOSE_AFTER_END_MS);
  return { open: nowMs >= opensAt.getTime() && nowMs <= closesAt.getTime(), opensAt, closesAt };
}

/** Who the caller is for this appointment: "patient", "provider", or null. */
export function sideFor(appointment, authUser) {
  if (!appointment || !authUser) return null;
  if (authUser.profileId && String(appointment.patientId) === String(authUser.profileId) && authUser.accountType !== "organization") {
    return "patient";
  }
  const org = String(appointment.organizationId);
  if (authUser.accountType === "organization" && authUser.organizationId && org === String(authUser.organizationId)) return "provider";
  if (authUser.organizationId && org === String(authUser.organizationId)) return "provider";
  return null;
}

const BLOCKED = new Set(["cancelled", "no-show", "completed"]);

/** Reasons a call cannot start, in the order the person should hear them. */
export function joinState(appointment, side, nowMs = Date.now()) {
  if (!side) return { ok: false, status: 403, code: "NOT_PARTICIPANT", message: "This visit is not yours." };
  if (appointment.visitType !== "virtual") return { ok: false, status: 409, code: "NOT_VIRTUAL", message: "This is an in-person visit." };
  if (BLOCKED.has(appointment.status)) return { ok: false, status: 409, code: "VISIT_CLOSED", message: `This visit is ${appointment.status}.` };
  const w = joinWindow(appointment.scheduledFor, appointment.durationMin, nowMs);
  if (!w.open) {
    return nowMs < w.opensAt.getTime()
      ? { ok: false, status: 425, code: "TOO_EARLY", message: "The room opens 10 minutes before the visit.", opensAt: w.opensAt }
      : { ok: false, status: 410, code: "WINDOW_CLOSED", message: "The time to join this visit has passed." };
  }
  return { ok: true, window: w };
}
