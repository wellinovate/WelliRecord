// Provider verification rules. No database, no network: everything here is a pure function so it can be tested.
//
// Three things live here and nowhere else:
//   1. the status state machine (six states, who may move a provider between them),
//   2. the eligibility check (`evaluateEligibility`), which every clinical path reaches through `canPerform`,
//   3. the expiry clock (renewal due, expired, reminder thresholds).
//
// The eligibility check fails closed. Missing or odd data means "not eligible", never "eligible".
// ----- vocabulary -----
export const CATEGORIES = ['doctor', 'dentist', 'nurse', 'lab_scientist', 'pharmacist'];
/** Pilot scope: doctors only. The other categories share the schema but are not switched on until their regulators are engaged. */
export const ACTIVATED_CATEGORIES = ['doctor'];
export const SPECIALTY_TIERS = ['none', 'radiologist'];
/** Provisional, full and specialist. Confirm the exact MDCN terms before launch. */
export const REGISTRATION_LEVELS = ['provisional', 'full', 'specialist'];
export const STATUSES = ['application_pending', 'further_evidence_required', 'verified_active', 'renewal_due', 'on_hold', 'expired'];
/** Only these two statuses grant clinical functions. */
export const CLINICAL_STATUSES = ['verified_active', 'renewal_due'];
export const SOURCE_TYPES = ['public_register', 'regulator_letter', 'provider_document', 'regulator_feed'];
/** Primary-source evidence: checked against the regulator, not supplied by the provider. */
export const PRIMARY_SOURCES = ['public_register', 'regulator_letter', 'regulator_feed'];
/** Permissions are defined per category, not per account. */
export const CATEGORY_FUNCTIONS = {
    doctor: ['consult', 'document', 'refer', 'prescribe', 'access_records'],
    dentist: ['consult', 'document', 'refer', 'prescribe', 'access_records'],
    nurse: ['nursing_documentation', 'observations'],
    lab_scientist: ['result_entry', 'result_release'],
    pharmacist: ['dispense', 'verify_dispense'],
};
/** The radiologist tier is a doctor plus imaging reports. */
export const TIER_FUNCTIONS = { none: [], radiologist: ['imaging_report'] };
/** Imaging reports need specialist registration. Confirm with the regulator and the radiology college. */
export const IMAGING_REQUIRES_LEVEL = ['specialist'];
export const ACTIONS = [
    'book_consultation', 'start_consultation', 'access_patient_record', 'write_prescription', 'write_referral',
    'write_clinical_note', 'write_imaging_report', 'appear_in_search',
    'enter_result', 'release_result', 'dispense', 'verify_dispense', 'nursing_note', 'record_observation',
];
export const ACTION_FUNCTION = {
    book_consultation: 'consult',
    start_consultation: 'consult',
    appear_in_search: 'consult',
    access_patient_record: 'access_records',
    write_prescription: 'prescribe',
    write_referral: 'refer',
    write_clinical_note: 'document',
    write_imaging_report: 'imaging_report',
    enter_result: 'result_entry',
    release_result: 'result_release',
    dispense: 'dispense',
    verify_dispense: 'verify_dispense',
    nursing_note: 'nursing_documentation',
    record_observation: 'observations',
};
export function functionsFor(category, tier) {
    const base = CATEGORY_FUNCTIONS[category] ?? [];
    const extra = category === 'doctor' ? TIER_FUNCTIONS[tier] ?? [] : [];
    return [...base, ...extra];
}
// ----- dates -----
/** A licence runs to the end of its expiry day in Lagos (23:59:59.999 at UTC+1). Input is YYYY-MM-DD. */
export function expiryInstant(ymd) {
    if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd))
        return null;
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 22, 59, 59, 999));
    return Number.isNaN(dt.getTime()) || dt.getUTCMonth() !== m - 1 ? null : dt;
}
export const DAY_MS = 86_400_000;
export const daysUntil = (instant, now) => Math.ceil((instant.getTime() - now.getTime()) / DAY_MS);
const deny = (reason) => ({ eligible: false, reason });
/**
 * Whether this provider may do this at this moment. Checks category activation, status, credential expiry,
 * registration level, category permissions and any active restriction. Any error or missing data is a denial.
 */
export function evaluateEligibility(p, action, now = new Date()) {
    try {
        if (!p || !p.id)
            return deny('no_provider');
        if (!(action in ACTION_FUNCTION))
            return deny('unknown_action');
        const act = action;
        const fn = ACTION_FUNCTION[act];
        if (!ACTIVATED_CATEGORIES.includes(p.category))
            return deny('category_inactive');
        if (!CLINICAL_STATUSES.includes(p.status))
            return deny('status_not_clinical');
        // Expiry is checked on every call, whatever the status says: a lapsed licence never works, even before the daily job runs.
        const exp = expiryInstant(p.licenceExpiry);
        if (!exp)
            return deny('no_expiry');
        if (now.getTime() > exp.getTime())
            return deny('expired');
        if (p.registrationLevel === 'provisional')
            return deny('provisional_registration');
        if (!REGISTRATION_LEVELS.includes(String(p.registrationLevel)))
            return deny('level_insufficient');
        if (!functionsFor(p.category, p.specialtyTier).includes(fn))
            return deny('function_not_permitted');
        if (fn === 'imaging_report' && !IMAGING_REQUIRES_LEVEL.includes(String(p.registrationLevel)))
            return deny('level_insufficient');
        if (!Array.isArray(p.grantedFunctions) || !p.grantedFunctions.includes(fn))
            return deny('permission_revoked');
        if (!Array.isArray(p.restrictions))
            return deny('error'); // unknown restriction state is not 'no restrictions'
        for (const r of p.restrictions) {
            if (r.scope === 'all' || r.scope === act || r.scope === fn)
                return deny('restricted');
        }
        return { eligible: true, reason: 'ok' };
    }
    catch {
        return deny('error');
    }
}
export const REVIEWER_ROLES = ['reviewer', 'senior_reviewer', 'compliance_admin'];
/** Only these may move a case to verified_active. */
export const APPROVER_ROLES = ['senior_reviewer', 'compliance_admin'];
const TRANSITIONS = {
    application_pending: { request_evidence: 'further_evidence_required', approve: 'verified_active' },
    further_evidence_required: { submit_evidence: 'application_pending' },
    verified_active: { mark_renewal_due: 'renewal_due', put_on_hold: 'on_hold', expire: 'expired' },
    renewal_due: { approve: 'verified_active', put_on_hold: 'on_hold', expire: 'expired' },
    on_hold: { lift_hold: 'verified_active', expire: 'expired' },
    expired: { reapply: 'application_pending' },
};
/** Who may trigger each event. 'provider' is the person being verified; 'system' is a scheduled job. */
const EVENT_ACTORS = {
    request_evidence: REVIEWER_ROLES,
    submit_evidence: ['provider'],
    approve: APPROVER_ROLES,
    put_on_hold: APPROVER_ROLES,
    lift_hold: APPROVER_ROLES,
    mark_renewal_due: ['system'],
    expire: ['system'],
    reapply: ['provider'],
};
export const HOLD_REASON_CODES = ['licence_check_pending', 'evidence_under_review', 'record_discrepancy', 'regulator_query', 'administrative'];
/** Wording that states or implies misconduct. A reason that contains any of these is refused. */
const MISCONDUCT_WORDS = new RegExp('\\b(' +
    [
        'misconduct', 'fraud\\w*', 'negligen\\w*', 'malpractice', 'criminal\\w*', 'illegal\\w*', 'unlawful', 'abus\\w*',
        'disciplin\\w*', 'struck\\s+off', 'erased', 'guilty', 'convict\\w*', 'unethical', 'fak(?:e|ed|ing)', 'forg(?:ed|ery|ing)',
        'impersonat\\w*', 'dishonest\\w*', 'scam\\w*', 'corrupt\\w*', 'incompeten\\w*', 'harm(?:ed|ful)?', 'complain\\w*',
        'investigat\\w*', 'suspect\\w*', 'suspen\\w*', 'sanction\\w*', 'offen[cs]e\\w*', 'violat\\w*', 'breach\\w*', 'unsafe', 'lied', 'lying',
    ].join('|') +
    ')\\b', 'i');
/** Null when the text is acceptable as a hold reason. A guard, not a guarantee: reviewers still write neutral text. */
export function reasonProblem(text) {
    const t = typeof text === 'string' ? text.trim() : '';
    if (t.length < 5)
        return 'Give a short reason';
    if (t.length > 300)
        return 'Keep the reason under 300 characters';
    if (MISCONDUCT_WORDS.test(t))
        return 'The reason must not state or imply misconduct. Describe the administrative step instead.';
    return null;
}
export function nextStatus(i) {
    if (!STATUSES.includes(i.from))
        return { ok: false, reason: 'Unknown status' };
    const row = TRANSITIONS[i.from];
    const to = row[i.event];
    if (!to)
        return { ok: false, reason: `A provider who is ${i.from.replace(/_/g, ' ')} cannot take that step` };
    const allowed = EVENT_ACTORS[i.event];
    if (!allowed.includes(i.actorRole))
        return { ok: false, reason: 'That role cannot take this step' };
    if (i.event === 'approve') {
        if (i.actorId && i.subjectStaffId && i.actorId === i.subjectStaffId)
            return { ok: false, reason: 'Nobody can approve their own case' };
        if (i.actorId && i.assignedReviewerId && i.actorId === i.assignedReviewerId)
            return { ok: false, reason: 'The assigned reviewer cannot also approve. Another approver must decide.' };
    }
    if (i.event === 'put_on_hold') {
        const h = i.hold;
        if (!h || !HOLD_REASON_CODES.includes(String(h.reasonCode)))
            return { ok: false, reason: 'A hold needs a reason code' };
        if (!h.evidenceRef || !String(h.evidenceRef).trim())
            return { ok: false, reason: 'A hold needs an evidence reference' };
        const p = reasonProblem(h.note);
        if (p)
            return { ok: false, reason: p };
    }
    return { ok: true, to };
}
/** Lifting a hold returns the provider to verified_active, unless the licence ran out meanwhile. */
export function liftTarget(licenceExpiry, now) {
    const exp = expiryInstant(licenceExpiry);
    return !exp || now.getTime() > exp.getTime() ? 'expired' : 'verified_active';
}
/** One person proposes, a different approver applies it. An approver acting alone is an emergency override: logged and reviewed afterwards. */
export function checkRestrictionApproval(i) {
    if (!APPROVER_ROLES.includes(i.approverRole))
        return { ok: false, reason: 'Only a senior reviewer or compliance admin can apply a restriction' };
    if (i.emergency)
        return { ok: true };
    if (i.proposedBy === i.approverId)
        return { ok: false, reason: 'A second person must approve. Use the emergency override only when it cannot wait.' };
    return { ok: true };
}
/** The emergency override must be reviewed by someone other than the person who used it. */
export function checkEmergencyReview(i) {
    if (!APPROVER_ROLES.includes(i.reviewerRole))
        return { ok: false, reason: 'Only a senior reviewer or compliance admin can review an override' };
    if (i.appliedBy === i.reviewerId)
        return { ok: false, reason: 'Someone else must review an emergency override' };
    return { ok: true };
}
export const RESTRICTION_SCOPES = ['all', 'consult', 'prescribe', 'refer', 'document', 'access_records', 'imaging_report'];
export const REVIEW_WINDOW_HOURS = 24;
// ----- expiry clock -----
export const REMINDER_DAYS = [60, 30, 7];
export const RENEWAL_WINDOW_DAYS = 60;
/**
 * What the daily job should do for one provider. Expiry needs no human step: once the licence date has passed the provider is expired.
 * One reminder per run: if the job was down and two thresholds were crossed, the most urgent is sent and both are marked.
 */
export function expiryActions(p, now) {
    const out = [];
    const exp = expiryInstant(p.licenceExpiry);
    if (!exp)
        return out;
    const live = ['verified_active', 'renewal_due', 'on_hold'].includes(p.status);
    if (!live)
        return out;
    if (now.getTime() > exp.getTime())
        return [{ providerId: p.id, kind: 'expire' }];
    const left = daysUntil(exp, now);
    if (p.status === 'verified_active' && left <= RENEWAL_WINDOW_DAYS)
        out.push({ providerId: p.id, kind: 'mark_renewal_due' });
    if (p.status !== 'on_hold') {
        const sent = p.remindersSent ?? [];
        const crossed = REMINDER_DAYS.filter((d) => left <= d && !sent.includes(d));
        if (crossed.length)
            out.push({ providerId: p.id, kind: 'remind', days: Math.min(...crossed), markSent: [...crossed] });
    }
    return out;
}
/** A manual recheck is overdue when its due date has passed and it is not done. */
export const recheckOverdue = (dueAt, doneAt, now) => !doneAt && now.getTime() > dueAt.getTime();
export const RECHECK_INTERVAL_DAYS = 180;
// ----- audit -----
export const LAWFUL_BASES = ['consent', 'contract', 'legal_obligation', 'vital_interests', 'public_interest', 'legitimate_interests'];
/** Record access needs a stated purpose and a lawful basis or consent reference. Returns a problem or null. */
export function auditProblem(a, requiresBasis) {
    if (!a.actorId || !a.action || !a.subjectType || !a.subjectId)
        return 'Audit event is missing the actor, action or subject';
    if (requiresBasis) {
        if (!a.purpose || !a.purpose.trim())
            return 'Record access needs a purpose';
        if (!a.lawfulBasis || !LAWFUL_BASES.includes(a.lawfulBasis))
            return 'Record access needs a lawful basis';
    }
    return null;
}
// ----- documents -----
export const DOC_TYPES = ['id_document', 'practising_licence', 'registration_certificate', 'degree_certificate', 'other'];
export const PROVIDER_DOC_MAX_BYTES = 10_000_000;
export const PROVIDER_DOC_MIME = ['application/pdf', 'image/jpeg', 'image/png'];
/** Documents per case. */
export const MAX_DOCS_PER_PROVIDER = 12;
const median = (xs) => {
    if (!xs.length)
        return null;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const hours = (a, b) => Math.round(((b.getTime() - a.getTime()) / 3_600_000) * 10) / 10;
export function verificationMetrics(m) {
    const live = m.providers.filter((p) => ['verified_active', 'renewal_due', 'on_hold'].includes(p.status));
    const withPrimary = live.filter((p) => m.credentials.some((c) => c.providerId === p.id && PRIMARY_SOURCES.includes(c.sourceType)));
    return {
        providersLive: live.length,
        primarySourceShare: live.length ? Math.round((withPrimary.length / live.length) * 1000) / 10 : null,
        verificationHoursMedian: median(m.cases.filter((c) => c.decidedAt).map((c) => hours(c.submittedAt, c.decidedAt))),
        expiredOrInvalidFound: m.expiredOrInvalidFound,
        hoursFromConfirmedIssueToRestrictionMedian: median(m.restrictions.filter((r) => r.confirmedIssueAt && r.appliedAt).map((r) => hours(r.confirmedIssueAt, r.appliedAt))),
        complaintsOpened: m.complaints.length,
        complaintResolutionHoursMedian: median(m.complaints.filter((c) => c.resolvedAt).map((c) => hours(c.openedAt, c.resolvedAt))),
        consultationsByEligibleShare: m.consultations.total ? Math.round((m.consultations.eligible / m.consultations.total) * 1000) / 10 : null,
    };
}
