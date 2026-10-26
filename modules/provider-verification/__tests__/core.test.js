import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ACTIONS, checkEmergencyReview, checkRestrictionApproval, evaluateEligibility, expiryActions, expiryInstant, functionsFor, liftTarget, nextStatus, reasonProblem, recheckOverdue, verificationMetrics, auditProblem, } from '../verification_core.js';
const NOW = new Date('2026-10-23T12:00:00Z');
const doctor = (over = {}) => ({
    id: 'p1',
    category: 'doctor',
    specialtyTier: 'none',
    status: 'verified_active',
    registrationLevel: 'full',
    licenceExpiry: '2027-03-31',
    grantedFunctions: functionsFor('doctor', 'none'),
    restrictions: [],
    ...over,
});
describe('eligibility gate', () => {
    it('lets a verified full-registration doctor do every doctor action', () => {
        for (const a of ['book_consultation', 'start_consultation', 'access_patient_record', 'write_prescription', 'write_referral', 'write_clinical_note', 'appear_in_search']) {
            assert.equal(evaluateEligibility(doctor(), a, NOW).eligible, true, a);
        }
    });
    it('blocks booking, consultation and record access when the credential has expired', () => {
        const expired = doctor({ licenceExpiry: '2026-10-22' });
        for (const a of ['book_consultation', 'start_consultation', 'access_patient_record', 'write_prescription', 'appear_in_search']) {
            const r = evaluateEligibility(expired, a, NOW);
            assert.equal(r.eligible, false, a);
            assert.equal(r.reason, 'expired');
        }
    });
    it('blocks on an expired credential even when the status still says verified_active (before the daily job runs)', () => {
        assert.equal(evaluateEligibility(doctor({ status: 'verified_active', licenceExpiry: '2026-01-01' }), 'start_consultation', NOW).reason, 'expired');
    });
    it('keeps a licence valid through the whole expiry day in Lagos', () => {
        assert.equal(evaluateEligibility(doctor({ licenceExpiry: '2026-10-23' }), 'start_consultation', new Date('2026-10-23T22:30:00Z')).eligible, true);
        assert.equal(evaluateEligibility(doctor({ licenceExpiry: '2026-10-23' }), 'start_consultation', new Date('2026-10-23T23:00:01Z')).eligible, false);
    });
    it('renewal_due keeps access until the expiry date and not after it', () => {
        assert.equal(evaluateEligibility(doctor({ status: 'renewal_due', licenceExpiry: '2026-11-20' }), 'start_consultation', NOW).eligible, true);
        assert.equal(evaluateEligibility(doctor({ status: 'renewal_due', licenceExpiry: '2026-10-01' }), 'start_consultation', NOW).eligible, false);
    });
    it('gives no clinical function to any other status', () => {
        for (const s of ['application_pending', 'further_evidence_required', 'on_hold', 'expired']) {
            assert.equal(evaluateEligibility(doctor({ status: s }), 'start_consultation', NOW).reason, 'status_not_clinical', s);
        }
    });
    it('gives provisional-registration doctors no independent access', () => {
        for (const a of ['book_consultation', 'start_consultation', 'appear_in_search', 'write_prescription', 'write_referral', 'access_patient_record']) {
            assert.equal(evaluateEligibility(doctor({ registrationLevel: 'provisional' }), a, NOW).reason, 'provisional_registration', a);
        }
    });
    it('refuses categories that are not switched on, even with a clean record', () => {
        for (const c of ['dentist', 'nurse', 'lab_scientist', 'pharmacist']) {
            const p = doctor({ category: c, grantedFunctions: functionsFor(c, 'none') });
            assert.equal(evaluateEligibility(p, 'start_consultation', NOW).reason, 'category_inactive', c);
        }
    });
    it('only gives imaging reports to a specialist radiologist', () => {
        const radiologist = (level) => doctor({ specialtyTier: 'radiologist', registrationLevel: level, grantedFunctions: functionsFor('doctor', 'radiologist') });
        assert.equal(evaluateEligibility(radiologist('specialist'), 'write_imaging_report', NOW).eligible, true);
        assert.equal(evaluateEligibility(radiologist('full'), 'write_imaging_report', NOW).reason, 'level_insufficient');
        assert.equal(evaluateEligibility(doctor(), 'write_imaging_report', NOW).reason, 'function_not_permitted');
        // A radiologist keeps the doctor functions.
        assert.equal(evaluateEligibility(radiologist('specialist'), 'start_consultation', NOW).eligible, true);
    });
    it('does not give a doctor lab, pharmacy or nursing functions', () => {
        for (const a of ['enter_result', 'release_result', 'dispense', 'verify_dispense', 'nursing_note', 'record_observation']) {
            assert.equal(evaluateEligibility(doctor(), a, NOW).reason, 'function_not_permitted', a);
        }
    });
    it('needs an active permission row for the function', () => {
        assert.equal(evaluateEligibility(doctor({ grantedFunctions: ['document'] }), 'start_consultation', NOW).reason, 'permission_revoked');
        assert.equal(evaluateEligibility(doctor({ grantedFunctions: [] }), 'start_consultation', NOW).reason, 'permission_revoked');
    });
    it('honours restrictions by scope', () => {
        assert.equal(evaluateEligibility(doctor({ restrictions: [{ scope: 'all' }] }), 'start_consultation', NOW).reason, 'restricted');
        assert.equal(evaluateEligibility(doctor({ restrictions: [{ scope: 'prescribe' }] }), 'write_prescription', NOW).reason, 'restricted');
        assert.equal(evaluateEligibility(doctor({ restrictions: [{ scope: 'prescribe' }] }), 'start_consultation', NOW).eligible, true);
        assert.equal(evaluateEligibility(doctor({ restrictions: [{ scope: 'consult' }] }), 'appear_in_search', NOW).reason, 'restricted');
    });
    it('fails closed on missing, malformed or hostile data', () => {
        assert.equal(evaluateEligibility(null, 'start_consultation', NOW).eligible, false);
        assert.equal(evaluateEligibility(undefined, 'start_consultation', NOW).eligible, false);
        assert.equal(evaluateEligibility(doctor({ licenceExpiry: null }), 'start_consultation', NOW).reason, 'no_expiry');
        assert.equal(evaluateEligibility(doctor({ licenceExpiry: 'next year' }), 'start_consultation', NOW).reason, 'no_expiry');
        assert.equal(evaluateEligibility(doctor({ registrationLevel: undefined }), 'start_consultation', NOW).eligible, false);
        assert.equal(evaluateEligibility(doctor({ registrationLevel: 'honorary' }), 'start_consultation', NOW).eligible, false);
        assert.equal(evaluateEligibility(doctor(), 'do_anything', NOW).reason, 'unknown_action');
        assert.equal(evaluateEligibility({ id: 'x' }, 'start_consultation', NOW).eligible, false);
        assert.equal(evaluateEligibility({ ...doctor(), restrictions: 'nope' }, 'start_consultation', NOW).eligible, false);
        assert.equal(evaluateEligibility({ ...doctor(), restrictions: undefined }, 'start_consultation', NOW).eligible, false);
        assert.equal(evaluateEligibility({ ...doctor(), grantedFunctions: undefined }, 'start_consultation', NOW).eligible, false);
    });
    it('has a decision for every action', () => {
        for (const a of ACTIONS)
            assert.equal(typeof evaluateEligibility(doctor(), a, NOW).eligible, 'boolean');
    });
});
describe('expiry date', () => {
    it('is the end of the day in Lagos', () => {
        assert.equal(expiryInstant('2026-10-23')?.toISOString(), '2026-10-23T22:59:59.999Z');
    });
    it('rejects bad input', () => {
        for (const v of ['2026-02-30', '2026-13-01', '23/10/2026', '', null, undefined, 20261023])
            assert.equal(expiryInstant(v), null, String(v));
    });
});
describe('status state machine', () => {
    const approve = (over = {}) => nextStatus({ from: 'application_pending', event: 'approve', actorRole: 'senior_reviewer', actorId: 'a1', subjectStaffId: 's1', assignedReviewerId: 'r1', ...over });
    it('lets only an approver move a case to verified_active', () => {
        assert.deepEqual(approve(), { ok: true, to: 'verified_active' });
        assert.deepEqual(approve({ actorRole: 'compliance_admin' }), { ok: true, to: 'verified_active' });
        for (const role of ['reviewer', 'admin', 'clinician', 'records_officer', 'provider', 'system'])
            assert.equal(approve({ actorRole: role }).ok, false, role);
    });
    it('stops anyone approving their own case, or a case they are assigned to', () => {
        assert.equal(approve({ actorId: 's1' }).ok, false);
        assert.equal(approve({ actorId: 'r1' }).ok, false);
    });
    it('lets a reviewer ask for evidence, and the provider answer it', () => {
        assert.deepEqual(nextStatus({ from: 'application_pending', event: 'request_evidence', actorRole: 'reviewer' }), { ok: true, to: 'further_evidence_required' });
        assert.deepEqual(nextStatus({ from: 'further_evidence_required', event: 'submit_evidence', actorRole: 'provider' }), { ok: true, to: 'application_pending' });
        assert.equal(nextStatus({ from: 'further_evidence_required', event: 'approve', actorRole: 'senior_reviewer', actorId: 'a' }).ok, false);
    });
    it('only the system moves a provider to renewal_due or expired', () => {
        assert.deepEqual(nextStatus({ from: 'verified_active', event: 'mark_renewal_due', actorRole: 'system' }), { ok: true, to: 'renewal_due' });
        assert.deepEqual(nextStatus({ from: 'renewal_due', event: 'expire', actorRole: 'system' }), { ok: true, to: 'expired' });
        assert.deepEqual(nextStatus({ from: 'on_hold', event: 'expire', actorRole: 'system' }), { ok: true, to: 'expired' });
        assert.equal(nextStatus({ from: 'verified_active', event: 'expire', actorRole: 'senior_reviewer' }).ok, false);
    });
    it('expired providers reapply; they cannot be approved directly', () => {
        assert.equal(nextStatus({ from: 'expired', event: 'approve', actorRole: 'senior_reviewer', actorId: 'a' }).ok, false);
        assert.deepEqual(nextStatus({ from: 'expired', event: 'reapply', actorRole: 'provider' }), { ok: true, to: 'application_pending' });
    });
    it('on_hold needs a reason code, an evidence reference and neutral wording', () => {
        const hold = (h) => nextStatus({ from: 'verified_active', event: 'put_on_hold', actorRole: 'senior_reviewer', actorId: 'a', hold: h });
        assert.deepEqual(hold({ reasonCode: 'record_discrepancy', evidenceRef: 'REG-2026-114', note: 'Registration number does not match the register entry' }), { ok: true, to: 'on_hold' });
        assert.equal(hold({ reasonCode: 'record_discrepancy', note: 'Registration number does not match' }).ok, false);
        assert.equal(hold({ reasonCode: 'made_up', evidenceRef: 'x', note: 'Needs a recheck' }).ok, false);
        assert.equal(hold({ reasonCode: 'administrative', evidenceRef: 'x', note: 'Provider committed fraud' }).ok, false);
        assert.equal(nextStatus({ from: 'verified_active', event: 'put_on_hold', actorRole: 'senior_reviewer', actorId: 'a' }).ok, false);
        assert.equal(nextStatus({ from: 'application_pending', event: 'put_on_hold', actorRole: 'senior_reviewer', actorId: 'a', hold: { reasonCode: 'administrative', evidenceRef: 'x', note: 'Needs a recheck' } }).ok, false);
    });
    it('lifting a hold returns to verified_active unless the licence ran out', () => {
        assert.equal(liftTarget('2027-01-01', NOW), 'verified_active');
        assert.equal(liftTarget('2026-01-01', NOW), 'expired');
        assert.equal(liftTarget(null, NOW), 'expired');
    });
    it('rejects unknown statuses and events', () => {
        assert.equal(nextStatus({ from: 'deleted', event: 'approve', actorRole: 'senior_reviewer' }).ok, false);
        assert.equal(nextStatus({ from: 'application_pending', event: 'teleport', actorRole: 'senior_reviewer' }).ok, false);
    });
});
describe('hold reason wording', () => {
    it('accepts neutral administrative text', () => {
        for (const t of ['Awaiting the register lookup result', 'Licence date needs a recheck', 'Evidence under review by compliance'])
            assert.equal(reasonProblem(t), null, t);
    });
    it('refuses text that states or implies misconduct', () => {
        for (const t of ['Suspected fraud', 'Complaint received about this doctor', 'Under investigation', 'Practising illegally', 'Documents look forged', 'Disciplinary matter', 'Unsafe care reported']) {
            assert.notEqual(reasonProblem(t), null, t);
        }
    });
    it('refuses empty and oversized text', () => {
        assert.notEqual(reasonProblem(''), null);
        assert.notEqual(reasonProblem('a'.repeat(301)), null);
        assert.notEqual(reasonProblem(undefined), null);
    });
});
describe('two-person rule for restrictions', () => {
    it('needs a different approver', () => {
        assert.equal(checkRestrictionApproval({ proposedBy: 'a', approverId: 'b', approverRole: 'senior_reviewer' }).ok, true);
        assert.equal(checkRestrictionApproval({ proposedBy: 'a', approverId: 'a', approverRole: 'senior_reviewer' }).ok, false);
        assert.equal(checkRestrictionApproval({ proposedBy: 'a', approverId: 'b', approverRole: 'reviewer' }).ok, false);
    });
    it('allows an approver to override in an emergency, and requires someone else to review it', () => {
        assert.equal(checkRestrictionApproval({ proposedBy: 'a', approverId: 'a', approverRole: 'compliance_admin', emergency: true }).ok, true);
        assert.equal(checkRestrictionApproval({ proposedBy: 'a', approverId: 'a', approverRole: 'reviewer', emergency: true }).ok, false);
        assert.equal(checkEmergencyReview({ appliedBy: 'a', reviewerId: 'a', reviewerRole: 'senior_reviewer' }).ok, false);
        assert.equal(checkEmergencyReview({ appliedBy: 'a', reviewerId: 'b', reviewerRole: 'senior_reviewer' }).ok, true);
        assert.equal(checkEmergencyReview({ appliedBy: 'a', reviewerId: 'b', reviewerRole: 'reviewer' }).ok, false);
    });
});
describe('expiry job', () => {
    const p = (status, licenceExpiry, remindersSent = []) => ({ id: 'p1', status, licenceExpiry, remindersSent });
    it('expires a lapsed provider with no human step, from any live status', () => {
        for (const s of ['verified_active', 'renewal_due', 'on_hold'])
            assert.deepEqual(expiryActions(p(s, '2026-10-01'), NOW), [{ providerId: 'p1', kind: 'expire' }], s);
    });
    it('leaves pending, evidence and already expired providers alone', () => {
        for (const s of ['application_pending', 'further_evidence_required', 'expired'])
            assert.deepEqual(expiryActions(p(s, '2026-10-01'), NOW), [], s);
    });
    it('moves a provider to renewal_due 60 days out and sends the 60 day reminder', () => {
        const r = expiryActions(p('verified_active', '2026-12-20'), NOW);
        assert.ok(r.some((a) => a.kind === 'mark_renewal_due'));
        assert.deepEqual(r.find((a) => a.kind === 'remind'), { providerId: 'p1', kind: 'remind', days: 60, markSent: [60] });
    });
    it('does nothing more than 60 days out', () => {
        assert.deepEqual(expiryActions(p('verified_active', '2027-03-31'), NOW), []);
    });
    it('sends each reminder once', () => {
        assert.deepEqual(expiryActions(p('renewal_due', '2026-12-20', [60]), NOW), []);
        const r = expiryActions(p('renewal_due', '2026-11-15', [60]), NOW);
        assert.deepEqual(r, [{ providerId: 'p1', kind: 'remind', days: 30, markSent: [30] }]);
        const last = expiryActions(p('renewal_due', '2026-10-28', [60, 30]), NOW);
        assert.deepEqual(last, [{ providerId: 'p1', kind: 'remind', days: 7, markSent: [7] }]);
    });
    it('sends only the most urgent reminder when the job was down across thresholds', () => {
        const r = expiryActions(p('renewal_due', '2026-10-28', []), NOW).find((a) => a.kind === 'remind');
        assert.equal(r.days, 7);
        assert.deepEqual(r.markSent.sort((a, b) => a - b), [7, 30, 60]);
    });
    it('sends no reminders to a provider on hold', () => {
        assert.deepEqual(expiryActions(p('on_hold', '2026-11-15'), NOW), []);
    });
    it('ignores a provider with no usable expiry', () => {
        assert.deepEqual(expiryActions({ id: 'p', status: 'verified_active', licenceExpiry: null }, NOW), []);
    });
    it('flags an overdue manual recheck', () => {
        assert.equal(recheckOverdue(new Date('2026-10-01'), null, NOW), true);
        assert.equal(recheckOverdue(new Date('2026-11-01'), null, NOW), false);
        assert.equal(recheckOverdue(new Date('2026-10-01'), new Date('2026-10-02'), NOW), false);
    });
});
describe('audit input', () => {
    it('needs a purpose and a lawful basis for record access', () => {
        const base = { actorId: 'p1', action: 'record_access', subjectType: 'patient', subjectId: 'u1' };
        assert.notEqual(auditProblem(base, true), null);
        assert.notEqual(auditProblem({ ...base, purpose: 'consultation' }, true), null);
        assert.notEqual(auditProblem({ ...base, purpose: 'consultation', lawfulBasis: 'because' }, true), null);
        assert.equal(auditProblem({ ...base, purpose: 'consultation', lawfulBasis: 'consent' }, true), null);
        assert.equal(auditProblem(base, false), null);
        assert.notEqual(auditProblem({ ...base, actorId: '' }, false), null);
    });
});
describe('metrics', () => {
    it('computes the six measures', () => {
        const t = (s) => new Date(s);
        const m = verificationMetrics({
            providers: [{ id: 'a', status: 'verified_active' }, { id: 'b', status: 'renewal_due' }, { id: 'c', status: 'application_pending' }],
            credentials: [{ providerId: 'a', sourceType: 'public_register' }, { providerId: 'b', sourceType: 'provider_document' }],
            cases: [{ submittedAt: t('2026-10-01T00:00:00Z'), decidedAt: t('2026-10-03T00:00:00Z') }, { submittedAt: t('2026-10-01T00:00:00Z'), decidedAt: t('2026-10-02T00:00:00Z') }, { submittedAt: t('2026-10-05T00:00:00Z') }],
            expiredOrInvalidFound: 2,
            restrictions: [{ confirmedIssueAt: t('2026-10-01T00:00:00Z'), appliedAt: t('2026-10-01T06:00:00Z') }, { appliedAt: t('2026-10-02T00:00:00Z') }],
            complaints: [{ openedAt: t('2026-10-01T00:00:00Z'), resolvedAt: t('2026-10-02T00:00:00Z') }, { openedAt: t('2026-10-01T00:00:00Z') }],
            consultations: { total: 4, eligible: 3 },
        });
        assert.equal(m.providersLive, 2);
        assert.equal(m.primarySourceShare, 50);
        assert.equal(m.verificationHoursMedian, 36);
        assert.equal(m.expiredOrInvalidFound, 2);
        assert.equal(m.hoursFromConfirmedIssueToRestrictionMedian, 6);
        assert.equal(m.complaintsOpened, 2);
        assert.equal(m.complaintResolutionHoursMedian, 24);
        assert.equal(m.consultationsByEligibleShare, 75);
    });
    it('returns null rather than dividing by zero', () => {
        const m = verificationMetrics({ providers: [], credentials: [], cases: [], expiredOrInvalidFound: 0, restrictions: [], complaints: [], consultations: { total: 0, eligible: 0 } });
        assert.equal(m.primarySourceShare, null);
        assert.equal(m.verificationHoursMedian, null);
        assert.equal(m.consultationsByEligibleShare, null);
    });
});
