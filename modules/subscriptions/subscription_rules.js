// Subscription rules. No database in this file.
//
// A subscription has a paid-up period. When it ends there is a grace period of 3 to 5 days.
// After the grace period the provider is suspended until a payment extends the period.
// The state is always worked out from the dates, so a missed sweep never leaves a lapsed
// provider active.

export const MIN_GRACE_DAYS = 3;
export const MAX_GRACE_DAYS = 5;
export const DEFAULT_GRACE_DAYS = 5;
const DAY = 24 * 60 * 60 * 1000;

export const clampGraceDays = (n) => {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return DEFAULT_GRACE_DAYS;
  return Math.min(MAX_GRACE_DAYS, Math.max(MIN_GRACE_DAYS, v));
};

export const graceEndsAt = (sub) => new Date(new Date(sub.periodEnd).getTime() + clampGraceDays(sub.graceDays) * DAY);

// "none" = no subscription record or exempt: never blocked.
export const subscriptionState = (sub, now = new Date()) => {
  if (!sub || sub.exempt || !sub.periodEnd) return "none";
  const t = now.getTime();
  if (t <= new Date(sub.periodEnd).getTime()) return "active";
  if (t <= graceEndsAt(sub).getTime()) return "grace";
  return "suspended";
};

export const describeSubscription = (sub, now = new Date()) => {
  const state = subscriptionState(sub, now);
  if (state === "none") return { state, periodEnd: sub?.periodEnd || null, graceEndsAt: null, daysLeft: null };
  const end = new Date(sub.periodEnd);
  const gEnd = graceEndsAt(sub);
  const target = state === "active" ? end : gEnd;
  return {
    state,
    periodEnd: end,
    graceEndsAt: gEnd,
    // Whole days until the period ends (active) or the grace period ends (grace). 0 once suspended.
    daysLeft: state === "suspended" ? 0 : Math.max(0, Math.ceil((target.getTime() - now.getTime()) / DAY)),
  };
};

const addMonths = (date, months) => {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
};

// Paying while active or in grace continues from the old end date, so no paid time is lost.
// Paying after suspension starts from the payment date.
export const nextPeriodEnd = (sub, months, now = new Date()) => {
  const m = Math.round(Number(months));
  if (!Number.isFinite(m) || m < 1 || m > 36) throw new Error("Months must be between 1 and 36.");
  const state = subscriptionState(sub, now);
  const base = state === "active" || state === "grace" ? new Date(sub.periodEnd) : now;
  return addMonths(base, m);
};

// What the sweep must tell people. Each notice is sent once per period (stamp = the period end).
export const noticesDue = (sub, now = new Date()) => {
  const state = subscriptionState(sub, now);
  const stamp = sub?.periodEnd ? new Date(sub.periodEnd).toISOString() : "";
  const due = [];
  if ((state === "grace" || state === "suspended") && sub.endedNoticeFor !== stamp) due.push("ended");
  if (state === "suspended" && sub.suspendedNoticeFor !== stamp) due.push("suspended");
  return due;
};

export const cleanSubscriptionInput = (b = {}) => {
  const errors = [];
  const out = {};
  if (b.plan !== undefined) out.plan = String(b.plan).trim().slice(0, 80);
  if (b.amountKobo !== undefined) {
    const a = Number(b.amountKobo);
    if (!Number.isInteger(a) || a < 0 || a > 100_000_000_00) errors.push("Amount must be a whole number of kobo, 0 or more.");
    else out.amountKobo = a;
  }
  if (b.periodEnd !== undefined) {
    const d = new Date(b.periodEnd);
    if (Number.isNaN(d.getTime())) errors.push("Period end is not a valid date.");
    else out.periodEnd = d;
  }
  if (b.graceDays !== undefined) {
    const g = Number(b.graceDays);
    if (!Number.isInteger(g) || g < MIN_GRACE_DAYS || g > MAX_GRACE_DAYS) errors.push(`Grace period must be ${MIN_GRACE_DAYS} to ${MAX_GRACE_DAYS} days.`);
    else out.graceDays = g;
  }
  if (b.exempt !== undefined) out.exempt = Boolean(b.exempt);
  return { value: out, errors };
};
