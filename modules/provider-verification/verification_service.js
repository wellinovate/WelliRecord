// Provider verification: onboarding, the reviewer queue, approvals, restrictions, complaints, the eligibility gate and the
// scheduled expiry job. The rules live in providerVerificationCore.ts; this file reads and writes the database around them.
//
// Providers are staff accounts with the role `clinician`. This extends the existing staff sign-in, roles, second step and action
// log. It does not add a second login system.
import crypto from 'crypto';
import express from 'express';
import mongoose from 'mongoose';
import { Account as StaffUser } from '../accounts/account_model.js';
import { ACTIVATED_CATEGORIES, APPROVER_ROLES, CATEGORIES, DOC_TYPES, HOLD_REASON_CODES, LAWFUL_BASES, MAX_DOCS_PER_PROVIDER, PRIMARY_SOURCES, PROVIDER_DOC_MAX_BYTES, PROVIDER_DOC_MIME, RECHECK_INTERVAL_DAYS, REGISTRATION_LEVELS, RESTRICTION_SCOPES, REVIEWER_ROLES, REVIEW_WINDOW_HOURS, SOURCE_TYPES, checkEmergencyReview, checkRestrictionApproval, evaluateEligibility, expiryActions, expiryInstant, functionsFor, liftTarget, nextStatus, reasonProblem, recheckOverdue, verificationMetrics, auditProblem, } from './verification_core.js';
import { PvCase, PvComplaint, PvCredential, PvDocument, PvPermission, PvProvider, PvRecheck, PvRestriction, auditIsRestricted, auditModelFor, } from './verification_models.js';
import { safeDocName, sniffProviderDoc } from './doc_storage.js';
export const PROVIDER_TERMS_VERSION = 'draft-1';
export const COMPLAINT_TYPES = ['impersonation', 'unprofessional_conduct', 'privacy_breach', 'unsafe_care', 'fraud'];
/** Reports that go straight to a senior reviewer. */
const SENIOR_COMPLAINTS = ['impersonation', 'fraud'];
/** Enforcement is on unless PROVIDER_VERIFICATION_ENFORCE=false. The off switch exists for an emergency and is logged at boot. */
export const enforcementOn = () => String(process.env.PROVIDER_VERIFICATION_ENFORCE ?? 'true').toLowerCase() !== 'false';
const clean = (v, max) => String(v ?? '').trim().slice(0, max);
const isId = (v) => mongoose.isValidObjectId(String(v ?? ''));
const lagosToday = (d) => new Date(d.getTime() + 3_600_000).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86_400_000);
const REG_NUMBER = /^[A-Za-z0-9][A-Za-z0-9\-\/ ]{2,23}$/;
const docDto = (d) => ({
    id: String(d._id), docType: d.docType, name: d.originalName, mime: d.mime, sizeBytes: d.sizeBytes ?? d.declaredSize,
    uploaded: d.uploadState === 'uploaded', scanStatus: d.scanStatus, uploadedAt: d.uploadedAt ?? null,
});
export function createProviderVerification(deps) {
    const router = express.Router();
    const now = () => (deps.now ? deps.now() : new Date());
    const db = () => mongoose.connection.readyState === 1;
    const noDb = (res) => res.status(503).json({ success: false, message: 'Not available right now. Try again shortly.' });
    const fail = (res, status, message, code) => res.status(status).json({ success: false, message, ...(code ? { code } : {}) });
    const oops = (res, req, err, message) => {
        console.error('[500]', req.method, req.path, err);
        return res.status(500).json({ success: false, message });
    };
    // ----- audit -----
    /** Writes one audit row. Throws if it cannot, so a state change is never reported as done without its audit row. */
    async function audit(a, requiresBasis = false) {
        const problem = auditProblem(a, requiresBasis);
        if (problem)
            throw new Error(problem);
        await auditModelFor().create({ ...a, timestamp: now() });
    }
    const auditSafe = async (...args) => {
        try {
            await audit(...args);
        }
        catch (err) {
            console.error('[VERIFY] audit write failed:', err);
        }
    };
    // ----- the gate -----
    async function snapshot(p) {
        const [perms, restr] = await Promise.all([
            PvPermission.find({ providerId: String(p._id), revokedAt: { $exists: false } }).lean(),
            PvRestriction.find({ providerId: String(p._id), state: 'active', liftedAt: { $exists: false } }).lean(),
        ]);
        return {
            id: String(p._id), category: p.category, specialtyTier: p.specialtyTier, status: p.status,
            registrationLevel: p.registrationLevel ?? null, licenceExpiry: p.licenceExpiry ?? null,
            grantedFunctions: perms.map((x) => x.function), restrictions: restr.map((x) => ({ scope: x.scope })),
        };
    }
    /**
     * The one eligibility check. Every clinical path calls this. It fails closed: an error, a missing record or a database that is
     * not connected all mean "not eligible". Denials, and every consultation start, are written to the audit log.
     */
    async function canPerform(ref, action, ctx = {}) {
        if (!enforcementOn())
            return { eligible: true, reason: 'ok' };
        let result = { eligible: false, reason: 'error' };
        try {
            if (!db())
                throw new Error('database not connected');
            const p = ref.providerId && isId(ref.providerId)
                ? await PvProvider.findById(ref.providerId)
                : ref.staffUserId ? await PvProvider.findOne({ $or: [{ staffUserId: String(ref.staffUserId) }, { linkedStaffIds: String(ref.staffUserId) }] }) : null;
            result = p ? { ...evaluateEligibility(await snapshot(p), action, now()), providerId: String(p._id) } : { eligible: false, reason: 'no_provider' };
        }
        catch (err) {
            console.error('[VERIFY] gate error (treated as not eligible):', err);
            result = { eligible: false, reason: 'error' };
        }
        if (action !== 'appear_in_search' && (!result.eligible || action === 'start_consultation')) {
            await auditSafe({
                actorId: String(ref.staffUserId ?? ref.providerId ?? 'unknown'), actorType: 'system', action: 'gate_decision', subjectType: 'provider',
                subjectId: String(result.providerId ?? ref.providerId ?? ref.staffUserId ?? 'unknown'),
                detail: { action, eligible: result.eligible, reason: result.reason, ...(ctx.facilityId ? { facilityId: ctx.facilityId } : {}) },
            });
        }
        return result;
    }
    /** Express guard form of the gate for a signed-in clinician. Sends 403 and returns false when not eligible. */
    async function gateStaff(req, res, action, ctx = {}) {
        const s = req.staff;
        if (!s) {
            fail(res, 401, 'Staff sign-in required.');
            return false;
        }
        const r = await canPerform({ staffUserId: s.id }, action, ctx);
        if (r.eligible)
            return true;
        fail(res, 403, 'Your provider verification does not allow this. Check your status under Provider verification.', 'not_verified');
        return false;
    }
    /** A facility can take bookings when it has no assigned clinicians to check, or at least one of them is eligible. */
    async function facilityEligible(staffIds, facilityId) {
        if (!enforcementOn())
            return true;
        if (!staffIds.length)
            return true; // no individual clinician is linked, so there is nothing to check here (see CLAUDE.md)
        for (const id of staffIds) {
            if ((await canPerform({ staffUserId: id }, 'book_consultation', { facilityId })).eligible)
                return true;
        }
        return false;
    }
    /** Records that a provider opened a patient record: who, when, why, and on what lawful basis or consent reference. */
    async function auditRecordAccess(a) {
        await audit({
            actorId: a.staffUserId, actorType: 'staff', action: 'record_access', subjectType: 'patient', subjectId: a.patientRef,
            purpose: a.purpose, lawfulBasis: a.lawfulBasis, detail: a.consentRef ? { consentRef: a.consentRef } : undefined,
        }, true);
    }
    /** Filters search results: an individual practitioner shows up only when their linked provider record is eligible. */
    async function eligibleOrgIds(orgIds) {
        const out = new Set();
        if (!enforcementOn())
            return new Set(orgIds);
        if (!orgIds.length || !db())
            return out;
        try {
            const ps = await PvProvider.find({ organizationId: { $in: orgIds } });
            for (const p of ps) {
                if (evaluateEligibility(await snapshot(p), 'appear_in_search', now()).eligible)
                    out.add(String(p.organizationId));
            }
        }
        catch (err) {
            console.error('[VERIFY] search filter error (hiding practitioners):', err);
        }
        return out;
    }
    // ----- helpers -----
    async function providerFor(req) {
        return req.staff ? PvProvider.findOne({ staffUserId: req.staff.id }) : null;
    }
    async function transition(p, event, actor, extra = {}) {
        const r = nextStatus({ from: p.status, event, actorRole: actor.role, actorId: actor.id, subjectStaffId: p.staffUserId, assignedReviewerId: extra.assignedReviewerId, hold: extra.hold });
        if (!r.ok)
            return r;
        const from = p.status;
        p.status = r.to;
        await p.save();
        await audit({ actorId: actor.id, actorType: actor.type, action: `status_${event}`, subjectType: 'provider', subjectId: String(p._id), detail: { from, to: r.to, ...(extra.reason ? { reason: extra.reason } : {}) } });
        return r;
    }
    const notifyProvider = async (p, subject, text) => {
        try {
            if (!deps.sendEmail)
                return;
            const u = await StaffUser.findById(p.staffUserId).select('email').lean();
            if (u?.email)
                await deps.sendEmail(u.email, subject, text);
        }
        catch (err) {
            console.error('[VERIFY] notify failed:', err);
        }
    };
    const isReviewer = (req) => Boolean(req.staff && REVIEWER_ROLES.includes(req.staff.role));
    const isApprover = (req) => Boolean(req.staff && APPROVER_ROLES.includes(req.staff.role));
    /** Verification staff only. Plain admin accounts manage staff, not verification decisions or documents. */
    const verifierOnly = (req, res) => (isReviewer(req) ? true : (fail(res, 403, 'Only verification staff can do this.'), false));
    const approverOnly = (req, res) => (isApprover(req) ? true : (fail(res, 403, 'Only a senior reviewer or compliance admin can do this.'), false));
    // =====================================================================
    // PROVIDER: apply, see status, upload documents, answer evidence requests
    // =====================================================================
    router.post('/provider/verification/apply', deps.limiter, deps.requireStaff('clinician'), async (req, res) => {
        if (!db())
            return noDb(res);
        try {
            const b = req.body ?? {};
            const category = clean(b.category, 30);
            if (!CATEGORIES.includes(category))
                return fail(res, 400, 'Choose your category');
            if (!ACTIVATED_CATEGORIES.includes(category))
                return fail(res, 400, 'Verification for this category has not opened yet.', 'category_inactive');
            const regulator = clean(b.regulator, 40) || 'MDCN';
            const registrationNumber = clean(b.registrationNumber, 24);
            if (!REG_NUMBER.test(registrationNumber))
                return fail(res, 400, 'Enter your registration number as it appears on your licence');
            const registrationLevel = clean(b.registrationLevel, 20);
            if (!REGISTRATION_LEVELS.includes(registrationLevel))
                return fail(res, 400, 'Choose provisional, full or specialist registration');
            const licenceExpiry = clean(b.licenceExpiry, 10);
            if (!expiryInstant(licenceExpiry) || licenceExpiry <= lagosToday(now()))
                return fail(res, 400, 'Enter a licence expiry date in the future (YYYY-MM-DD)');
            const claimedTier = b.specialtyTier === 'radiologist' ? 'radiologist' : 'none';
            const a = b.accepted ?? {};
            if (a.conduct !== true || a.confidentiality !== true || a.consent !== true)
                return fail(res, 400, 'Accept the conduct, confidentiality and consent terms to continue', 'terms_required');
            const staff = req.staff;
            let p = await PvProvider.findOne({ staffUserId: staff.id });
            const open = p ? await PvCase.findOne({ providerId: String(p._id), state: 'open' }) : null;
            if (open)
                return fail(res, 409, 'You already have an application in progress.');
            let kind = 'initial';
            if (!p) {
                p = await PvProvider.create({ staffUserId: staff.id, displayName: staff.name, category, status: 'application_pending', termsAcceptedAt: now(), termsVersion: PROVIDER_TERMS_VERSION });
            }
            else if (p.status === 'expired') {
                const r = await transition(p, 'reapply', { id: staff.id, role: 'provider', type: 'provider' });
                if (!r.ok)
                    return fail(res, 409, r.reason);
                kind = 'renewal';
            }
            else if (p.status === 'renewal_due') {
                kind = 'renewal';
            }
            else if (p.status !== 'application_pending') {
                return fail(res, 409, 'Your status does not allow a new application right now.');
            }
            p.termsAcceptedAt = now();
            p.termsVersion = PROVIDER_TERMS_VERSION;
            await p.save();
            const cred = await PvCredential.create({ providerId: String(p._id), regulator, registrationNumber, registrationLevel, licenceExpiry, sourceType: 'provider_document' });
            const c = await PvCase.create({ providerId: String(p._id), kind, claimedTier, state: 'open', submittedAt: now() });
            await audit({ actorId: staff.id, actorType: 'provider', action: 'application_submitted', subjectType: 'provider', subjectId: String(p._id), detail: { caseId: String(c._id), kind, credentialId: String(cred._id), termsVersion: PROVIDER_TERMS_VERSION } });
            return res.status(201).json({ success: true, caseId: String(c._id), status: p.status });
        }
        catch (err) {
            return oops(res, req, err, 'Could not submit your application');
        }
    });
    router.get('/provider/verification/me', deps.requireStaff('clinician'), async (req, res) => {
        if (!db())
            return noDb(res);
        try {
            const p = await providerFor(req);
            if (!p)
                return res.json({ success: true, applied: false, categories: ACTIVATED_CATEGORIES, termsVersion: PROVIDER_TERMS_VERSION });
            const [open, last, docs, snap] = await Promise.all([
                PvCase.findOne({ providerId: String(p._id), state: 'open' }),
                PvCase.findOne({ providerId: String(p._id), state: 'closed' }).sort({ decidedAt: -1 }),
                PvDocument.find({ providerId: String(p._id), deletedAt: { $exists: false } }).sort({ createdAt: 1 }),
                snapshot(p),
            ]);
            return res.json({
                success: true, applied: true,
                provider: { status: p.status, category: p.category, specialtyTier: p.specialtyTier, registrationLevel: p.registrationLevel ?? null, licenceExpiry: p.licenceExpiry ?? null, verifiedAt: p.verifiedAt ?? null },
                evidenceRequests: (open?.evidenceRequests ?? []).map((e) => ({ text: e.text, requestedAt: e.requestedAt, answeredAt: e.answeredAt ?? null })),
                openCase: open ? { id: String(open._id), kind: open.kind, submittedAt: open.submittedAt } : null,
                lastDecision: last ? { decision: last.decision, reason: last.reason ?? null, decidedAt: last.decidedAt } : null,
                documents: docs.map(docDto),
                canStartConsultation: evaluateEligibility(snap, 'start_consultation', now()),
                uploadsAvailable: deps.storage.configured,
                termsVersion: PROVIDER_TERMS_VERSION,
            });
        }
        catch (err) {
            return oops(res, req, err, 'Could not load your verification');
        }
    });
    router.post('/provider/verification/documents', deps.limiter, deps.requireStaff('clinician'), async (req, res) => {
        if (!db())
            return noDb(res);
        if (!deps.storage.configured)
            return fail(res, 503, 'Document upload is not available yet.');
        try {
            const p = await providerFor(req);
            if (!p)
                return fail(res, 409, 'Submit your application first');
            if (!['application_pending', 'further_evidence_required', 'renewal_due', 'expired'].includes(p.status))
                return fail(res, 409, 'Documents cannot be added in your current status');
            const docType = clean(req.body?.docType, 40);
            const mime = clean(req.body?.mime, 40);
            const size = Number(req.body?.size);
            if (!DOC_TYPES.includes(docType))
                return fail(res, 400, 'Choose what this document is');
            if (!PROVIDER_DOC_MIME.includes(mime))
                return fail(res, 415, 'Upload a PDF, JPEG or PNG file');
            if (!Number.isInteger(size) || size < 1 || size > PROVIDER_DOC_MAX_BYTES)
                return fail(res, 413, `Files can be up to ${Math.round(PROVIDER_DOC_MAX_BYTES / 1_000_000)} MB`);
            if ((await PvDocument.countDocuments({ providerId: String(p._id), deletedAt: { $exists: false } })) >= MAX_DOCS_PER_PROVIDER)
                return fail(res, 409, 'You have reached the document limit');
            const retentionDays = Math.max(30, Number(process.env.PROVIDER_DOC_RETENTION_DAYS) || 2555);
            const objectKey = `pv/${String(p._id)}/${crypto.randomUUID()}`;
            const d = await PvDocument.create({ providerId: String(p._id), docType, objectKey, originalName: safeDocName(req.body?.name), mime, declaredSize: size, retentionUntil: addDays(now(), retentionDays) });
            const slot = deps.storage.signedPutUrl(objectKey, { contentType: mime, contentLength: size, expiresSec: 600 });
            return res.status(201).json({ success: true, documentId: String(d._id), upload: { method: 'PUT', url: slot.url, headers: slot.headers, expiresInSeconds: 600 } });
        }
        catch (err) {
            return oops(res, req, err, 'Could not start the upload');
        }
    });
    /** Checks an uploaded object, then scans it. Shared by the complete route and the sweep that retries pending scans. */
    async function inspectDocument(d) {
        const head = await deps.storage.head(d.objectKey);
        if (!head)
            return 'rejected';
        if (head.size !== d.declaredSize || head.size > PROVIDER_DOC_MAX_BYTES) {
            await deps.storage.deleteObject(d.objectKey);
            return 'rejected';
        }
        const bytes = await deps.storage.getObject(d.objectKey);
        if (!bytes)
            return 'rejected';
        if (sniffProviderDoc(bytes) !== d.mime) {
            await deps.storage.deleteObject(d.objectKey);
            return 'rejected';
        }
        d.sizeBytes = bytes.length;
        d.sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
        d.uploadState = 'uploaded';
        d.uploadedAt = d.uploadedAt ?? now();
        const verdict = deps.scanner.configured ? await deps.scanner.scan(bytes) : 'error';
        if (verdict === 'infected') {
            await deps.storage.deleteObject(d.objectKey);
            d.scanStatus = 'infected';
            d.deletedAt = now();
            await d.save();
            return 'infected';
        }
        d.scanStatus = verdict === 'clean' ? 'clean' : 'pending'; // an unscanned file is never treated as clean
        await d.save();
        return verdict === 'clean' ? 'clean' : 'pending';
    }
    router.post('/provider/verification/documents/:id/complete', deps.limiter, deps.requireStaff('clinician'), async (req, res) => {
        if (!db())
            return noDb(res);
        try {
            const p = await providerFor(req);
            const d = p && isId(req.params.id) ? await PvDocument.findOne({ _id: req.params.id, providerId: String(p._id), deletedAt: { $exists: false } }) : null;
            if (!d)
                return fail(res, 404, 'Document not found');
            if (d.uploadState === 'uploaded')
                return res.json({ success: true, document: docDto(d) });
            const v = await inspectDocument(d);
            await audit({ actorId: req.staff.id, actorType: 'provider', action: 'document_uploaded', subjectType: 'provider', subjectId: String(p._id), detail: { documentId: String(d._id), docType: d.docType, scan: v } });
            if (v === 'rejected') {
                d.deletedAt = now();
                await d.save();
                return fail(res, 422, 'That file was not accepted. Check the type and size, then upload again.');
            }
            if (v === 'infected')
                return fail(res, 422, 'That file could not be accepted. Upload a clean copy.');
            return res.json({ success: true, document: docDto(d) });
        }
        catch (err) {
            return oops(res, req, err, 'Could not finish the upload');
        }
    });
    router.delete('/provider/verification/documents/:id', deps.requireStaff('clinician'), async (req, res) => {
        if (!db())
            return noDb(res);
        try {
            const p = await providerFor(req);
            const d = p && isId(req.params.id) ? await PvDocument.findOne({ _id: req.params.id, providerId: String(p._id), deletedAt: { $exists: false } }) : null;
            if (!d)
                return fail(res, 404, 'Document not found');
            if (!['application_pending', 'further_evidence_required'].includes(p.status))
                return fail(res, 409, 'Documents cannot be removed in your current status');
            try {
                if (deps.storage.configured)
                    await deps.storage.deleteObject(d.objectKey);
            }
            catch (err) {
                console.error('[VERIFY] delete object failed:', err);
            }
            d.deletedAt = now();
            await d.save();
            await audit({ actorId: req.staff.id, actorType: 'provider', action: 'document_removed', subjectType: 'provider', subjectId: String(p._id), detail: { documentId: String(d._id) } });
            return res.json({ success: true });
        }
        catch (err) {
            return oops(res, req, err, 'Could not remove the document');
        }
    });
    router.post('/provider/verification/evidence', deps.limiter, deps.requireStaff('clinician'), async (req, res) => {
        if (!db())
            return noDb(res);
        try {
            const p = await providerFor(req);
            if (!p)
                return fail(res, 404, 'No application found');
            const c = await PvCase.findOne({ providerId: String(p._id), state: 'open' });
            if (!c)
                return fail(res, 409, 'There is no open application');
            const answer = clean(req.body?.answer, 1000);
            const r = await transition(p, 'submit_evidence', { id: req.staff.id, role: 'provider', type: 'provider' });
            if (!r.ok)
                return fail(res, 409, r.reason);
            for (const e of c.evidenceRequests)
                if (!e.answeredAt) {
                    e.answeredAt = now();
                    e.answer = answer || undefined;
                }
            c.markModified('evidenceRequests');
            await c.save();
            return res.json({ success: true, status: p.status });
        }
        catch (err) {
            return oops(res, req, err, 'Could not send your evidence');
        }
    });
    // =====================================================================
    // REVIEWERS: queue, case view, checks, decisions
    // =====================================================================
    router.get('/staff/verification/cases', deps.requireStaff('reviewer', 'senior_reviewer', 'compliance_admin'), async (req, res) => {
        if (!db())
            return noDb(res);
        try {
            const q = {};
            const state = clean(req.query.state, 10);
            q.state = state === 'closed' ? 'closed' : 'open';
            const assigned = clean(req.query.assigned, 40);
            if (assigned === 'me')
                q.assignedReviewer = req.staff.id;
            else if (assigned === 'unassigned')
                q.assignedReviewer = { $exists: false };
            else if (isId(assigned))
                q.assignedReviewer = assigned;
            const minAge = Number(req.query.minAgeDays);
            if (Number.isFinite(minAge) && minAge > 0)
                q.submittedAt = { $lte: addDays(now(), -minAge) };
            const cases = await PvCase.find(q).sort({ submittedAt: 1 }).limit(200);
            const provs = await PvProvider.find({ _id: { $in: cases.map((c) => c.providerId).filter(isId) } });
            const byId = new Map(provs.map((p) => [String(p._id), p]));
            const category = clean(req.query.category, 30);
            const status = clean(req.query.status, 40);
            const rows = cases
                .map((c) => ({ c, p: byId.get(String(c.providerId)) }))
                .filter(({ p }) => p && (!category || p.category === category) && (!status || p.status === status))
                .map(({ c, p }) => ({
                id: String(c._id), providerId: String(p._id), name: p.displayName, category: p.category, status: p.status, kind: c.kind,
                submittedAt: c.submittedAt, ageDays: Math.floor((now().getTime() - new Date(c.submittedAt).getTime()) / 86_400_000),
                assignedReviewer: c.assignedReviewer ?? null, checks: c.checks.length, awaitingEvidence: c.evidenceRequests.some((e) => !e.answeredAt),
            }));
            return res.json({ success: true, cases: rows });
        }
        catch (err) {
            return oops(res, req, err, 'Could not load the queue');
        }
    });
    router.get('/staff/verification/cases/:id', deps.requireStaff('reviewer', 'senior_reviewer', 'compliance_admin'), async (req, res) => {
        if (!db())
            return noDb(res);
        try {
            const c = isId(req.params.id) ? await PvCase.findById(req.params.id) : null;
            if (!c)
                return fail(res, 404, 'Case not found');
            const p = await PvProvider.findById(c.providerId);
            if (!p)
                return fail(res, 404, 'Provider not found');
            const [creds, docs, restr] = await Promise.all([
                PvCredential.find({ providerId: String(p._id) }).sort({ createdAt: 1 }),
                PvDocument.find({ providerId: String(p._id), deletedAt: { $exists: false } }).sort({ createdAt: 1 }),
                PvRestriction.find({ providerId: String(p._id) }).sort({ createdAt: -1 }),
            ]);
            const submitted = creds.filter((x) => x.sourceType === 'provider_document' && !x.checkedAt).pop();
            const checked = creds.filter((x) => x.checkedAt).pop();
            const compare = submitted && checked
                ? { registrationNumber: submitted.registrationNumber === checked.registrationNumber, registrationLevel: submitted.registrationLevel === checked.registrationLevel, licenceExpiry: submitted.licenceExpiry === checked.licenceExpiry }
                : null;
            await auditSafe({ actorId: req.staff.id, actorType: 'staff', action: 'case_viewed', subjectType: 'case', subjectId: String(c._id) });
            return res.json({
                success: true,
                case: { id: String(c._id), kind: c.kind, state: c.state, claimedTier: c.claimedTier, submittedAt: c.submittedAt, assignedReviewer: c.assignedReviewer ?? null, decision: c.decision ?? null, reason: c.reason ?? null, evidenceRequests: c.evidenceRequests, checks: c.checks },
                provider: { id: String(p._id), name: p.displayName, category: p.category, status: p.status, specialtyTier: p.specialtyTier, registrationLevel: p.registrationLevel ?? null, licenceExpiry: p.licenceExpiry ?? null, staffUserId: p.staffUserId },
                credentials: creds.map((x) => ({ id: String(x._id), regulator: x.regulator, registrationNumber: x.registrationNumber, registrationLevel: x.registrationLevel, licenceExpiry: x.licenceExpiry, sourceType: x.sourceType, sourceRef: x.sourceRef ?? null, checkedAt: x.checkedAt ?? null, checkedBy: x.checkedBy ?? null, result: x.result ?? null })),
                submittedVsChecked: compare,
                documents: docs.map(docDto),
                restrictions: restr.map((r) => ({ id: String(r._id), scope: r.scope, state: r.state, reasonCode: r.reasonCode, appliedAt: r.appliedAt ?? null })),
            });
        }
        catch (err) {
            return oops(res, req, err, 'Could not load the case');
        }
    });
    router.post('/staff/verification/cases/:id/assign', deps.requireStaff('reviewer', 'senior_reviewer', 'compliance_admin'), async (req, res) => {
        if (!db())
            return noDb(res);
        if (!verifierOnly(req, res))
            return;
        try {
            const c = isId(req.params.id) ? await PvCase.findById(req.params.id) : null;
            if (!c || c.state !== 'open')
                return fail(res, 404, 'Open case not found');
            const target = clean(req.body?.reviewerId, 40) || req.staff.id;
            if (target !== req.staff.id && !isApprover(req))
                return fail(res, 403, 'Only a senior reviewer or compliance admin can assign someone else');
            const u = isId(target) ? await StaffUser.findById(target) : null;
            if (!u || u.status !== 'active' || !REVIEWER_ROLES.includes(u.role))
                return fail(res, 400, 'Choose an active reviewer');
            const p = await PvProvider.findById(c.providerId);
            if (p && p.staffUserId === target)
                return fail(res, 400, 'Nobody can review their own case');
            c.assignedReviewer = target;
            await c.save();
            await audit({ actorId: req.staff.id, actorType: 'staff', action: 'case_assigned', subjectType: 'case', subjectId: String(c._id), detail: { reviewerId: target } });
            return res.json({ success: true });
        }
        catch (err) {
            return oops(res, req, err, 'Could not assign the case');
        }
    });
    /** Records one check against a source. Shared by case checks and manual rechecks. Returns the credential row when the source matched. */
    async function recordCheck(p, staffId, body) {
        const sourceType = clean(body?.sourceType, 30);
        if (!SOURCE_TYPES.includes(sourceType))
            return { error: 'Choose where this was checked' };
        if (sourceType === 'regulator_feed')
            return { error: 'Regulator feeds are not connected yet. Record a register lookup or a regulator letter.' };
        const sourceRef = clean(body?.sourceRef, 300);
        if (sourceRef.length < 3)
            return { error: 'Record the source: a register page address or a letter reference' };
        const result = clean(body?.result, 20);
        if (!['match', 'mismatch', 'not_found'].includes(result))
            return { error: 'Choose match, mismatch or not found' };
        const checkedAt = body?.checkedAt ? new Date(String(body.checkedAt)) : now();
        if (Number.isNaN(checkedAt.getTime()) || checkedAt.getTime() > now().getTime() + 60_000)
            return { error: 'The check date cannot be in the future' };
        const check = { sourceType, sourceRef, checkedAt, checkedBy: staffId, result, note: clean(body?.note, 500) || undefined };
        let credential;
        const registrationNumber = clean(body?.registrationNumber, 24);
        const registrationLevel = clean(body?.registrationLevel, 20);
        const licenceExpiry = clean(body?.licenceExpiry, 10);
        if (result === 'match') {
            if (!REG_NUMBER.test(registrationNumber))
                return { error: 'Enter the registration number shown at the source' };
            if (!REGISTRATION_LEVELS.includes(registrationLevel))
                return { error: 'Enter the registration level shown at the source' };
            if (!expiryInstant(licenceExpiry))
                return { error: 'Enter the licence expiry date shown at the source (YYYY-MM-DD)' };
            const submitted = await PvCredential.findOne({ providerId: String(p._id), checkedAt: { $exists: false } }).sort({ createdAt: -1 });
            credential = await PvCredential.create({
                providerId: String(p._id), regulator: submitted?.regulator ?? 'MDCN', registrationNumber, registrationLevel, licenceExpiry,
                sourceType, sourceRef, checkedAt, checkedBy: staffId, result, note: check.note,
            });
            check.credentialId = String(credential._id);
        }
        return { check, credential };
    }
    router.post('/staff/verification/cases/:id/check', deps.limiter, deps.requireStaff('reviewer', 'senior_reviewer', 'compliance_admin'), async (req, res) => {
        if (!db())
            return noDb(res);
        if (!verifierOnly(req, res))
            return;
        try {
            const c = isId(req.params.id) ? await PvCase.findById(req.params.id) : null;
            if (!c || c.state !== 'open')
                return fail(res, 404, 'Open case not found');
            const p = await PvProvider.findById(c.providerId);
            if (!p)
                return fail(res, 404, 'Provider not found');
            if (p.staffUserId === req.staff.id)
                return fail(res, 403, 'Nobody can review their own case');
            const r = await recordCheck(p, req.staff.id, req.body);
            if (r.error)
                return fail(res, 400, r.error);
            c.checks.push(r.check);
            await c.save();
            await audit({ actorId: req.staff.id, actorType: 'staff', action: 'credential_checked', subjectType: 'case', subjectId: String(c._id), detail: { sourceType: r.check.sourceType, sourceRef: r.check.sourceRef, result: r.check.result, credentialId: r.check.credentialId ?? null } });
            if (r.check.result !== 'match')
                await auditSafe({ actorId: req.staff.id, actorType: 'staff', action: 'credential_invalid_found', subjectType: 'provider', subjectId: String(p._id), detail: { result: r.check.result, caseId: String(c._id) } });
            return res.json({ success: true, credentialId: r.check.credentialId ?? null });
        }
        catch (err) {
            return oops(res, req, err, 'Could not record the check');
        }
    });
    router.post('/staff/verification/cases/:id/request-evidence', deps.limiter, deps.requireStaff('reviewer', 'senior_reviewer', 'compliance_admin'), async (req, res) => {
        if (!db())
            return noDb(res);
        if (!verifierOnly(req, res))
            return;
        try {
            const c = isId(req.params.id) ? await PvCase.findById(req.params.id) : null;
            if (!c || c.state !== 'open')
                return fail(res, 404, 'Open case not found');
            const p = await PvProvider.findById(c.providerId);
            if (!p)
                return fail(res, 404, 'Provider not found');
            const text = clean(req.body?.text, 500);
            const problem = reasonProblem(text);
            if (problem)
                return fail(res, 400, problem);
            const r = await transition(p, 'request_evidence', { id: req.staff.id, role: req.staff.role, type: 'staff' }, { reason: text });
            if (!r.ok)
                return fail(res, 409, r.reason);
            c.evidenceRequests.push({ requestedBy: req.staff.id, requestedAt: now(), text });
            await c.save();
            await notifyProvider(p, 'More information needed for your WelliRecord verification', `A reviewer has asked for more information:\n\n${text}\n\nSign in and open Provider verification to respond.`);
            return res.json({ success: true, status: p.status });
        }
        catch (err) {
            return oops(res, req, err, 'Could not request evidence');
        }
    });
    router.post('/staff/verification/cases/:id/approve', deps.limiter, deps.requireStaff('reviewer', 'senior_reviewer', 'compliance_admin'), async (req, res) => {
        if (!db())
            return noDb(res);
        if (!approverOnly(req, res))
            return;
        try {
            const c = isId(req.params.id) ? await PvCase.findById(req.params.id) : null;
            if (!c || c.state !== 'open')
                return fail(res, 404, 'Open case not found');
            const p = await PvProvider.findById(c.providerId);
            if (!p)
                return fail(res, 404, 'Provider not found');
            const reason = clean(req.body?.reason, 300);
            if (reason.length < 5)
                return fail(res, 400, 'Record the reason for this decision');
            const cred = isId(req.body?.credentialId) ? await PvCredential.findOne({ _id: req.body.credentialId, providerId: String(p._id) }) : null;
            if (!cred || !cred.checkedAt || cred.result !== 'match')
                return fail(res, 400, 'Choose a credential that a reviewer has checked and matched');
            const exp = expiryInstant(cred.licenceExpiry);
            if (!exp || exp.getTime() <= now().getTime())
                return fail(res, 400, 'That credential has already expired');
            if (!c.checks.some((k) => k.checkedBy && k.checkedBy !== req.staff.id && k.result === 'match'))
                return fail(res, 409, 'A check by another reviewer is needed before approval');
            const docs = await PvDocument.find({ providerId: String(p._id), deletedAt: { $exists: false } });
            if (!docs.length)
                return fail(res, 409, 'The provider has not uploaded any documents');
            if (docs.some((d) => d.scanStatus !== 'clean' || d.uploadState !== 'uploaded'))
                return fail(res, 409, 'Every document must finish its malware scan before approval');
            const tier = c.claimedTier === 'radiologist' && req.body?.tier === 'radiologist' ? 'radiologist' : 'none';
            if (tier === 'radiologist' && cred.registrationLevel !== 'specialist')
                return fail(res, 400, 'The radiologist tier needs specialist registration at the source');
            const r = nextStatus({ from: p.status, event: 'approve', actorRole: req.staff.role, actorId: req.staff.id, subjectStaffId: p.staffUserId, assignedReviewerId: c.assignedReviewer });
            if (!r.ok)
                return fail(res, 403, r.reason);
            const from = p.status;
            p.status = r.to;
            p.licenceExpiry = cred.licenceExpiry;
            p.registrationLevel = cred.registrationLevel;
            p.governingCredentialId = String(cred._id);
            p.specialtyTier = tier;
            p.verifiedAt = now();
            p.nextReviewAt = addDays(now(), RECHECK_INTERVAL_DAYS);
            p.remindersSent = [];
            await p.save();
            await PvPermission.updateMany({ providerId: String(p._id), revokedAt: { $exists: false } }, { $set: { revokedAt: now() } });
            await PvPermission.insertMany(functionsFor(p.category, tier).map((fn) => ({ providerId: String(p._id), function: fn, grantedBy: req.staff.id, grantedAt: now() })));
            c.state = 'closed';
            c.decision = 'approved';
            c.reason = reason;
            c.decidedAt = now();
            c.decidedBy = req.staff.id;
            await c.save();
            await PvRecheck.create({ providerId: String(p._id), dueAt: p.nextReviewAt });
            await audit({ actorId: req.staff.id, actorType: 'staff', action: 'case_approved', subjectType: 'provider', subjectId: String(p._id), detail: { caseId: String(c._id), from, to: r.to, credentialId: String(cred._id), sourceType: cred.sourceType, tier, reason } });
            await notifyProvider(p, 'Your WelliRecord verification is approved', 'Your credentials have been checked and your account can now take consultations. Sign in to see your status.');
            return res.json({ success: true, status: p.status });
        }
        catch (err) {
            return oops(res, req, err, 'Could not approve the case');
        }
    });
    router.post('/staff/verification/cases/:id/reject', deps.limiter, deps.requireStaff('reviewer', 'senior_reviewer', 'compliance_admin'), async (req, res) => {
        if (!db())
            return noDb(res);
        if (!approverOnly(req, res))
            return;
        try {
            const c = isId(req.params.id) ? await PvCase.findById(req.params.id) : null;
            if (!c || c.state !== 'open')
                return fail(res, 404, 'Open case not found');
            const p = await PvProvider.findById(c.providerId);
            if (!p)
                return fail(res, 404, 'Provider not found');
            if (p.staffUserId === req.staff.id)
                return fail(res, 403, 'Nobody can decide their own case');
            const reason = clean(req.body?.reason, 300);
            const problem = reasonProblem(reason);
            if (problem)
                return fail(res, 400, problem);
            const from = p.status;
            if (p.status === 'further_evidence_required') {
                p.status = 'application_pending';
                await p.save();
            }
            c.state = 'closed';
            c.decision = 'rejected';
            c.reason = reason;
            c.decidedAt = now();
            c.decidedBy = req.staff.id;
            await c.save();
            await audit({ actorId: req.staff.id, actorType: 'staff', action: 'case_rejected', subjectType: 'provider', subjectId: String(p._id), detail: { caseId: String(c._id), from, reason } });
            await notifyProvider(p, 'Update on your WelliRecord verification', `Your application was not approved at this time.\n\nReason: ${reason}\n\nYou can sign in and apply again with the right details.`);
            return res.json({ success: true });
        }
        catch (err) {
            return oops(res, req, err, 'Could not reject the case');
        }
    });
    /** A short-lived link to read one document. Reviewers only, clean files only, every open is logged. */
    router.get('/staff/verification/documents/:id/url', deps.requireStaff('reviewer', 'senior_reviewer', 'compliance_admin'), async (req, res) => {
        if (!db())
            return noDb(res);
        if (!verifierOnly(req, res))
            return;
        try {
            const d = isId(req.params.id) ? await PvDocument.findOne({ _id: req.params.id, deletedAt: { $exists: false } }) : null;
            if (!d || d.uploadState !== 'uploaded')
                return fail(res, 404, 'Document not found');
            if (d.scanStatus !== 'clean')
                return fail(res, 409, 'This document has not passed its malware scan');
            if (!deps.storage.configured)
                return fail(res, 503, 'Document storage is not available');
            await audit({ actorId: req.staff.id, actorType: 'staff', action: 'document_viewed', subjectType: 'provider', subjectId: d.providerId, purpose: 'credential verification', lawfulBasis: 'legitimate_interests', detail: { documentId: String(d._id) } }, true);
            return res.json({ success: true, url: deps.storage.signedGetUrl(d.objectKey, 120), expiresInSeconds: 120 });
        }
        catch (err) {
            return oops(res, req, err, 'Could not open the document');
        }
    });
    /** Links a person in the mobile clinic console to this provider, so the mobile gate can find the verified record. Approvers only. */
    router.post('/staff/verification/providers/:id/link-staff', deps.limiter, deps.requireStaff('senior_reviewer', 'compliance_admin'), async (req, res) => {
        if (!db())
            return noDb(res);
        try {
            const p = isId(req.params.id) ? await PvProvider.findById(req.params.id) : null;
            if (!p)
                return fail(res, 404, 'Provider not found');
            const staffId = clean(req.body?.staffId, 80);
            if (staffId.length < 8)
                return fail(res, 400, 'Enter the staff id from the clinic console');
            const taken = await PvProvider.findOne({ $or: [{ staffUserId: staffId }, { linkedStaffIds: staffId }], _id: { $ne: p._id } });
            if (taken)
                return fail(res, 409, 'That staff id is already linked to another provider');
            if (!p.linkedStaffIds.includes(staffId))
                p.linkedStaffIds.push(staffId);
            await p.save();
            await audit({ actorId: req.staff.id, actorType: 'staff', action: 'staff_linked', subjectType: 'provider', subjectId: String(p._id), detail: { staffId } });
            return res.json({ success: true });
        }
        catch (err) {
            return oops(res, req, err, 'Could not link the staff id.');
        }
    });
    /** Links a verified provider to their website organisation profile so they can appear in search. Approvers only. */
    router.post('/staff/verification/providers/:id/link-organization', deps.limiter, deps.requireStaff('senior_reviewer', 'compliance_admin'), async (req, res) => {
        if (!db())
            return noDb(res);
        try {
            const p = isId(req.params.id) ? await PvProvider.findById(req.params.id) : null;
            if (!p)
                return fail(res, 404, 'Provider not found');
            const orgId = clean(req.body?.organizationId, 80);
            if (orgId.length < 3)
                return fail(res, 400, 'Enter the organisation id from the website profile');
            const taken = await PvProvider.findOne({ organizationId: orgId, _id: { $ne: p._id } });
            if (taken)
                return fail(res, 409, 'That organisation is already linked to another provider');
            p.organizationId = orgId;
            await p.save();
            await audit({ actorId: req.staff.id, actorType: 'staff', action: 'organization_linked', subjectType: 'provider', subjectId: String(p._id), detail: { organizationId: orgId } });
            return res.json({ success: true });
        }
        catch (err) {
            return oops(res, req, err, 'Could not link the organisation');
        }
    });
    // ----- renewal and recheck queues -----
    router.get('/staff/verification/renewals', deps.requireStaff('reviewer', 'senior_reviewer', 'compliance_admin'), async (req, res) => {
        if (!db())
            return noDb(res);
        try {
            const rows = await PvProvider.find({ status: { $in: ['renewal_due', 'expired'] } }).sort({ licenceExpiry: 1 }).limit(200);
            return res.json({ success: true, providers: rows.map((p) => ({ id: String(p._id), name: p.displayName, category: p.category, status: p.status, licenceExpiry: p.licenceExpiry ?? null, remindersSent: p.remindersSent })) });
        }
        catch (err) {
            return oops(res, req, err, 'Could not load renewals');
        }
    });
    router.get('/staff/verification/rechecks', deps.requireStaff('reviewer', 'senior_reviewer', 'compliance_admin'), async (req, res) => {
        if (!db())
            return noDb(res);
        try {
            const tasks = await PvRecheck.find({ doneAt: { $exists: false } }).sort({ dueAt: 1 }).limit(200);
            const provs = await PvProvider.find({ _id: { $in: tasks.map((t) => t.providerId).filter(isId) } });
            const byId = new Map(provs.map((p) => [String(p._id), p]));
            return res.json({
                success: true,
                rechecks: tasks.map((t) => ({ id: String(t._id), providerId: t.providerId, name: byId.get(String(t.providerId))?.displayName ?? null, dueAt: t.dueAt, overdue: recheckOverdue(t.dueAt, t.doneAt, now()) })),
            });
        }
        catch (err) {
            return oops(res, req, err, 'Could not load rechecks');
        }
    });
    router.post('/staff/verification/rechecks/:id/complete', deps.limiter, deps.requireStaff('reviewer', 'senior_reviewer', 'compliance_admin'), async (req, res) => {
        if (!db())
            return noDb(res);
        if (!verifierOnly(req, res))
            return;
        try {
            const t = isId(req.params.id) ? await PvRecheck.findById(req.params.id) : null;
            if (!t || t.doneAt)
                return fail(res, 404, 'Open recheck not found');
            const p = await PvProvider.findById(t.providerId);
            if (!p)
                return fail(res, 404, 'Provider not found');
            if (p.staffUserId === req.staff.id)
                return fail(res, 403, 'Nobody can recheck their own record');
            const r = await recordCheck(p, req.staff.id, req.body);
            if (r.error)
                return fail(res, 400, r.error);
            t.doneAt = now();
            t.doneBy = req.staff.id;
            await t.save();
            await audit({ actorId: req.staff.id, actorType: 'staff', action: 'recheck_completed', subjectType: 'provider', subjectId: String(p._id), detail: { result: r.check.result, sourceType: r.check.sourceType, sourceRef: r.check.sourceRef } });
            if (r.check.result !== 'match') {
                await auditSafe({ actorId: req.staff.id, actorType: 'staff', action: 'credential_invalid_found', subjectType: 'provider', subjectId: String(p._id), detail: { result: r.check.result } });
            }
            else if (r.credential && p.licenceExpiry && r.credential.licenceExpiry < p.licenceExpiry) {
                // A recheck can only shorten the recorded expiry. Extending it needs a renewal case and an approver.
                const was = p.licenceExpiry;
                p.licenceExpiry = r.credential.licenceExpiry;
                await p.save();
                await audit({ actorId: req.staff.id, actorType: 'staff', action: 'expiry_shortened', subjectType: 'provider', subjectId: String(p._id), detail: { from: was, to: p.licenceExpiry } });
            }
            if (['verified_active', 'renewal_due', 'on_hold'].includes(p.status)) {
                p.nextReviewAt = addDays(now(), RECHECK_INTERVAL_DAYS);
                await p.save();
                await PvRecheck.create({ providerId: String(p._id), dueAt: p.nextReviewAt });
            }
            return res.json({ success: true, result: r.check.result });
        }
        catch (err) {
            return oops(res, req, err, 'Could not record the recheck');
        }
    });
    // =====================================================================
    // RESTRICTIONS: one proposes, a different approver applies; emergency override is logged and reviewed afterwards
    // =====================================================================
    async function applyRestriction(r, approver, emergency) {
        const p = await PvProvider.findById(r.providerId);
        if (!p)
            throw new Error('provider missing');
        r.state = 'active';
        r.appliedBy = approver.id;
        r.appliedAt = now();
        r.emergency = emergency;
        r.reviewState = emergency ? 'pending' : 'not_needed';
        r.reviewDueAt = emergency ? new Date(now().getTime() + REVIEW_WINDOW_HOURS * 3_600_000) : undefined;
        await r.save();
        // A restriction on everything puts the provider on hold. Narrower scopes block only that function and leave the status alone.
        let status = null;
        if (r.scope === 'all' && ['verified_active', 'renewal_due'].includes(p.status)) {
            const t = await transition(p, 'put_on_hold', { id: approver.id, role: approver.role, type: 'staff' }, { hold: { reasonCode: r.reasonCode, evidenceRef: r.evidenceRef, note: r.reason }, reason: r.reason });
            if (t.ok)
                status = t.to;
        }
        await audit({ actorId: approver.id, actorType: 'staff', action: emergency ? 'restriction_emergency_applied' : 'restriction_applied', subjectType: 'provider', subjectId: String(p._id), detail: { restrictionId: String(r._id), scope: r.scope, reasonCode: r.reasonCode, evidenceRef: r.evidenceRef, status } });
        return status;
    }
    router.post('/staff/verification/restrictions', deps.limiter, deps.requireStaff('reviewer', 'senior_reviewer', 'compliance_admin'), async (req, res) => {
        if (!db())
            return noDb(res);
        if (!verifierOnly(req, res))
            return;
        try {
            const b = req.body ?? {};
            const p = isId(b.providerId) ? await PvProvider.findById(b.providerId) : null;
            if (!p)
                return fail(res, 404, 'Provider not found');
            if (p.staffUserId === req.staff.id)
                return fail(res, 403, 'Nobody can restrict their own record');
            const scope = clean(b.scope, 30);
            if (!RESTRICTION_SCOPES.includes(scope))
                return fail(res, 400, `Scope must be one of ${RESTRICTION_SCOPES.join(', ')}`);
            const reasonCode = clean(b.reasonCode, 40);
            if (!HOLD_REASON_CODES.includes(reasonCode))
                return fail(res, 400, 'Choose a reason code');
            const reason = clean(b.reason, 300);
            const problem = reasonProblem(reason);
            if (problem)
                return fail(res, 400, problem);
            const evidenceRef = clean(b.evidenceRef, 200);
            if (!evidenceRef)
                return fail(res, 400, 'Record the evidence reference');
            const emergency = b.emergency === true;
            if (emergency && !isApprover(req))
                return fail(res, 403, 'Only a senior reviewer or compliance admin can use the emergency override');
            const confirmed = b.confirmedIssueAt ? new Date(String(b.confirmedIssueAt)) : null;
            const r = await PvRestriction.create({
                providerId: String(p._id), scope, reasonCode, reason, evidenceRef, state: 'proposed', proposedBy: req.staff.id, proposedAt: now(),
                confirmedIssueAt: confirmed && !Number.isNaN(confirmed.getTime()) ? confirmed : undefined,
            });
            await audit({ actorId: req.staff.id, actorType: 'staff', action: 'restriction_proposed', subjectType: 'provider', subjectId: String(p._id), detail: { restrictionId: String(r._id), scope, reasonCode, evidenceRef, emergency } });
            if (emergency) {
                const status = await applyRestriction(r, { id: req.staff.id, role: req.staff.role }, true);
                return res.status(201).json({ success: true, id: String(r._id), state: 'active', status, reviewDueAt: r.reviewDueAt });
            }
            return res.status(201).json({ success: true, id: String(r._id), state: 'proposed' });
        }
        catch (err) {
            return oops(res, req, err, 'Could not record the restriction');
        }
    });
    router.post('/staff/verification/restrictions/:id/approve', deps.limiter, deps.requireStaff('reviewer', 'senior_reviewer', 'compliance_admin'), async (req, res) => {
        if (!db())
            return noDb(res);
        if (!verifierOnly(req, res))
            return;
        try {
            const r = isId(req.params.id) ? await PvRestriction.findById(req.params.id) : null;
            if (!r || r.state !== 'proposed')
                return fail(res, 404, 'Proposed restriction not found');
            const p = await PvProvider.findById(r.providerId);
            if (p && p.staffUserId === req.staff.id)
                return fail(res, 403, 'Nobody can decide on their own record');
            const ok = checkRestrictionApproval({ proposedBy: r.proposedBy, approverId: req.staff.id, approverRole: req.staff.role });
            if (!ok.ok)
                return fail(res, 403, ok.reason);
            const status = await applyRestriction(r, { id: req.staff.id, role: req.staff.role }, false);
            return res.json({ success: true, state: 'active', status });
        }
        catch (err) {
            return oops(res, req, err, 'Could not apply the restriction');
        }
    });
    router.post('/staff/verification/restrictions/:id/reject', deps.limiter, deps.requireStaff('reviewer', 'senior_reviewer', 'compliance_admin'), async (req, res) => {
        if (!db())
            return noDb(res);
        if (!approverOnly(req, res))
            return;
        try {
            const r = isId(req.params.id) ? await PvRestriction.findById(req.params.id) : null;
            if (!r || r.state !== 'proposed')
                return fail(res, 404, 'Proposed restriction not found');
            r.state = 'rejected';
            await r.save();
            await audit({ actorId: req.staff.id, actorType: 'staff', action: 'restriction_rejected', subjectType: 'provider', subjectId: r.providerId, detail: { restrictionId: String(r._id) } });
            return res.json({ success: true });
        }
        catch (err) {
            return oops(res, req, err, 'Could not reject the restriction');
        }
    });
    /** A second approver reviews an emergency override. The person who used it cannot review it. */
    router.post('/staff/verification/restrictions/:id/review', deps.limiter, deps.requireStaff('reviewer', 'senior_reviewer', 'compliance_admin'), async (req, res) => {
        if (!db())
            return noDb(res);
        if (!verifierOnly(req, res))
            return;
        try {
            const r = isId(req.params.id) ? await PvRestriction.findById(req.params.id) : null;
            if (!r || !r.emergency || r.reviewState !== 'pending')
                return fail(res, 404, 'No override waiting for review');
            const ok = checkEmergencyReview({ appliedBy: r.appliedBy, reviewerId: req.staff.id, reviewerRole: req.staff.role });
            if (!ok.ok)
                return fail(res, 403, ok.reason);
            r.reviewState = 'reviewed';
            r.reviewedBy = req.staff.id;
            r.reviewedAt = now();
            await r.save();
            await audit({ actorId: req.staff.id, actorType: 'staff', action: 'restriction_override_reviewed', subjectType: 'provider', subjectId: r.providerId, detail: { restrictionId: String(r._id), outcome: clean(req.body?.outcome, 200) || 'confirmed' } });
            return res.json({ success: true });
        }
        catch (err) {
            return oops(res, req, err, 'Could not record the review');
        }
    });
    router.post('/staff/verification/restrictions/:id/lift', deps.limiter, deps.requireStaff('reviewer', 'senior_reviewer', 'compliance_admin'), async (req, res) => {
        if (!db())
            return noDb(res);
        if (!approverOnly(req, res))
            return;
        try {
            const r = isId(req.params.id) ? await PvRestriction.findById(req.params.id) : null;
            if (!r || r.state !== 'active')
                return fail(res, 404, 'Active restriction not found');
            const reason = clean(req.body?.reason, 300);
            if (reason.length < 5)
                return fail(res, 400, 'Record the reason for lifting it');
            const p = await PvProvider.findById(r.providerId);
            if (!p)
                return fail(res, 404, 'Provider not found');
            if (p.staffUserId === req.staff.id)
                return fail(res, 403, 'Nobody can decide on their own record');
            r.state = 'lifted';
            r.liftedAt = now();
            r.liftedBy = req.staff.id;
            if (r.appealState === 'requested')
                r.appealState = 'overturned';
            await r.save();
            let status = p.status;
            const stillAll = await PvRestriction.exists({ providerId: String(p._id), state: 'active', scope: 'all', _id: { $ne: r._id } });
            if (p.status === 'on_hold' && !stillAll) {
                const target = liftTarget(p.licenceExpiry, now());
                const t = target === 'expired'
                    ? await transition(p, 'expire', { id: 'system', role: 'system', type: 'system' })
                    : await transition(p, 'lift_hold', { id: req.staff.id, role: req.staff.role, type: 'staff' }, { reason });
                if (t.ok)
                    status = t.to;
            }
            await audit({ actorId: req.staff.id, actorType: 'staff', action: 'restriction_lifted', subjectType: 'provider', subjectId: String(p._id), detail: { restrictionId: String(r._id), reason, status } });
            return res.json({ success: true, status });
        }
        catch (err) {
            return oops(res, req, err, 'Could not lift the restriction');
        }
    });
    /** The provider can ask for a restriction to be looked at again. */
    router.post('/provider/verification/restrictions/:id/appeal', deps.limiter, deps.requireStaff('clinician'), async (req, res) => {
        if (!db())
            return noDb(res);
        try {
            const p = await providerFor(req);
            const r = p && isId(req.params.id) ? await PvRestriction.findOne({ _id: req.params.id, providerId: String(p._id), state: 'active' }) : null;
            if (!r)
                return fail(res, 404, 'Restriction not found');
            if (r.appealState === 'requested')
                return fail(res, 409, 'Your request is already with a reviewer');
            r.appealState = 'requested';
            r.appealNote = clean(req.body?.note, 500) || undefined;
            await r.save();
            await audit({ actorId: req.staff.id, actorType: 'provider', action: 'restriction_appeal_requested', subjectType: 'provider', subjectId: String(p._id), detail: { restrictionId: String(r._id) } });
            return res.json({ success: true });
        }
        catch (err) {
            return oops(res, req, err, 'Could not send your request');
        }
    });
    router.get('/staff/verification/restrictions', deps.requireStaff('reviewer', 'senior_reviewer', 'compliance_admin'), async (req, res) => {
        if (!db())
            return noDb(res);
        try {
            const state = ['proposed', 'active', 'lifted', 'rejected'].includes(String(req.query.state)) ? String(req.query.state) : 'proposed';
            const rows = await PvRestriction.find({ state }).sort({ createdAt: -1 }).limit(200);
            return res.json({ success: true, restrictions: rows.map((r) => ({ id: String(r._id), providerId: r.providerId, scope: r.scope, reasonCode: r.reasonCode, state: r.state, emergency: r.emergency, reviewState: r.reviewState, reviewDueAt: r.reviewDueAt ?? null, appealState: r.appealState, proposedBy: r.proposedBy, proposedAt: r.proposedAt, appliedAt: r.appliedAt ?? null })) });
        }
        catch (err) {
            return oops(res, req, err, 'Could not load restrictions');
        }
    });
    // =====================================================================
    // COMPLAINTS
    // =====================================================================
    router.post('/provider-complaints', deps.limiter, async (req, res) => {
        const reporter = deps.getAuthUserId(req);
        if (!reporter)
            return fail(res, 401, 'Sign in to send a report');
        if (!db())
            return noDb(res);
        try {
            const b = req.body ?? {};
            const type = clean(b.type, 40);
            if (!COMPLAINT_TYPES.includes(type))
                return fail(res, 400, 'Choose what you are reporting');
            const description = clean(b.description, 1000);
            if (description.length < 20)
                return fail(res, 400, 'Describe what happened in a few sentences');
            const p = isId(b.providerId) ? await PvProvider.findById(b.providerId) : null;
            if (!p)
                return fail(res, 404, 'Provider not found');
            const recent = await PvComplaint.countDocuments({ reporterId: reporter, openedAt: { $gte: new Date(now().getTime() - 3_600_000) } });
            if (recent >= 5)
                return fail(res, 429, 'You have sent several reports in the last hour. Try again later.');
            const needsSenior = SENIOR_COMPLAINTS.includes(type);
            const c = await PvComplaint.create({ providerId: String(p._id), reporterId: reporter, type, description, needsSenior, openedAt: now() });
            await audit({ actorId: reporter, actorType: 'patient', action: 'complaint_opened', subjectType: 'provider', subjectId: String(p._id), detail: { complaintId: String(c._id), type, routedToSenior: needsSenior } });
            return res.status(201).json({ success: true, id: String(c._id), message: 'Thank you. A reviewer will look at your report.' });
        }
        catch (err) {
            return oops(res, req, err, 'Could not send your report');
        }
    });
    router.get('/staff/verification/complaints', deps.requireStaff('reviewer', 'senior_reviewer', 'compliance_admin'), async (req, res) => {
        if (!db())
            return noDb(res);
        try {
            const q = { state: { $in: ['open', 'assigned', 'escalated'] } };
            // Impersonation and fraud reports are for senior reviewers only.
            if (!isApprover(req))
                q.needsSenior = false;
            const rows = await PvComplaint.find(q).sort({ openedAt: 1 }).limit(200);
            return res.json({ success: true, complaints: rows.map((c) => ({ id: String(c._id), providerId: c.providerId, type: c.type, state: c.state, needsSenior: c.needsSenior, assignedTo: c.assignedTo ?? null, openedAt: c.openedAt, description: c.description })) });
        }
        catch (err) {
            return oops(res, req, err, 'Could not load reports');
        }
    });
    async function complaintFor(req, res) {
        const c = isId(req.params.id) ? await PvComplaint.findById(req.params.id) : null;
        if (!c) {
            fail(res, 404, 'Report not found');
            return null;
        }
        if (c.needsSenior && !isApprover(req)) {
            fail(res, 403, 'This report is for a senior reviewer.');
            return null;
        }
        return c;
    }
    router.post('/staff/verification/complaints/:id/assign', deps.limiter, deps.requireStaff('reviewer', 'senior_reviewer', 'compliance_admin'), async (req, res) => {
        if (!db())
            return noDb(res);
        if (!verifierOnly(req, res))
            return;
        try {
            const c = await complaintFor(req, res);
            if (!c)
                return;
            const target = clean(req.body?.assignTo, 40) || req.staff.id;
            if (target !== req.staff.id && !isApprover(req))
                return fail(res, 403, 'Only a senior reviewer can assign someone else');
            const u = isId(target) ? await StaffUser.findById(target) : null;
            if (!u || u.status !== 'active' || !REVIEWER_ROLES.includes(u.role))
                return fail(res, 400, 'Choose an active reviewer');
            if (c.needsSenior && !APPROVER_ROLES.includes(u.role))
                return fail(res, 400, 'Assign this report to a senior reviewer');
            c.assignedTo = target;
            c.state = 'assigned';
            await c.save();
            await audit({ actorId: req.staff.id, actorType: 'staff', action: 'complaint_assigned', subjectType: 'provider', subjectId: c.providerId, detail: { complaintId: String(c._id), assignedTo: target } });
            return res.json({ success: true });
        }
        catch (err) {
            return oops(res, req, err, 'Could not assign the report');
        }
    });
    router.post('/staff/verification/complaints/:id/outcome', deps.limiter, deps.requireStaff('reviewer', 'senior_reviewer', 'compliance_admin'), async (req, res) => {
        if (!db())
            return noDb(res);
        if (!verifierOnly(req, res))
            return;
        try {
            const c = await complaintFor(req, res);
            if (!c)
                return;
            const outcome = clean(req.body?.outcome, 600);
            if (outcome.length < 5)
                return fail(res, 400, 'Record the outcome');
            c.outcome = outcome;
            c.state = 'resolved';
            c.resolvedAt = now();
            await c.save();
            await audit({ actorId: req.staff.id, actorType: 'staff', action: 'complaint_resolved', subjectType: 'provider', subjectId: c.providerId, detail: { complaintId: String(c._id) } });
            return res.json({ success: true });
        }
        catch (err) {
            return oops(res, req, err, 'Could not record the outcome');
        }
    });
    router.post('/staff/verification/complaints/:id/escalate', deps.limiter, deps.requireStaff('reviewer', 'senior_reviewer', 'compliance_admin'), async (req, res) => {
        if (!db())
            return noDb(res);
        if (!approverOnly(req, res))
            return;
        try {
            const c = await complaintFor(req, res);
            if (!c)
                return;
            const to = clean(req.body?.escalatedTo, 120);
            if (!to)
                return fail(res, 400, 'Name who it is referred to, for example the regulator');
            c.escalatedTo = to;
            c.escalationNote = clean(req.body?.note, 500) || undefined;
            c.state = 'escalated';
            await c.save();
            await audit({ actorId: req.staff.id, actorType: 'staff', action: 'complaint_escalated', subjectType: 'provider', subjectId: c.providerId, detail: { complaintId: String(c._id), escalatedTo: to } });
            return res.json({ success: true });
        }
        catch (err) {
            return oops(res, req, err, 'Could not escalate the report');
        }
    });
    // =====================================================================
    // METRICS
    // =====================================================================
    router.get('/staff/verification/metrics', deps.requireStaff('senior_reviewer', 'compliance_admin'), async (req, res) => {
        if (!db())
            return noDb(res);
        try {
            const A = auditModelFor();
            const [providers, creds, cases, restr, complaints, invalid, total, eligible] = await Promise.all([
                PvProvider.find({}, 'status').lean(),
                PvCredential.find({ checkedAt: { $exists: true }, result: 'match' }, 'providerId sourceType').lean(),
                PvCase.find({}, 'submittedAt decidedAt').lean(),
                PvRestriction.find({ state: { $in: ['active', 'lifted'] } }, 'confirmedIssueAt appliedAt').lean(),
                PvComplaint.find({}, 'openedAt resolvedAt').lean(),
                A.countDocuments({ action: { $in: ['credential_invalid_found', 'status_expire'] } }),
                A.countDocuments({ action: 'gate_decision', 'detail.action': 'start_consultation' }),
                A.countDocuments({ action: 'gate_decision', 'detail.action': 'start_consultation', 'detail.eligible': true }),
            ]);
            const m = verificationMetrics({
                providers: providers.map((p) => ({ id: String(p._id), status: p.status })),
                credentials: creds.map((c) => ({ providerId: c.providerId, sourceType: c.sourceType })),
                cases: cases, expiredOrInvalidFound: invalid, restrictions: restr, complaints: complaints, consultations: { total, eligible },
            });
            return res.json({ success: true, metrics: m, primarySources: PRIMARY_SOURCES, auditRestricted: auditIsRestricted() });
        }
        catch (err) {
            return oops(res, req, err, 'Could not compute the measures');
        }
    });
    // =====================================================================
    // SCHEDULED JOB
    // =====================================================================
    /**
     * Runs hourly (every step is safe to repeat). Expires lapsed providers, moves others to renewal_due, sends the 60, 30 and 7 day reminders,
     * creates manual recheck tasks, alerts on overdue ones, retries pending malware scans and deletes documents past their retention date.
     */
    async function sweep() {
        if (!db())
            return { skipped: true };
        const t = now();
        const out = { expired: 0, renewalDue: 0, reminders: 0, rechecksCreated: 0, overdueAlerts: 0, scansRetried: 0, documentsDeleted: 0 };
        try {
            const live = await PvProvider.find({ status: { $in: ['verified_active', 'renewal_due', 'on_hold'] } });
            for (const p of live) {
                for (const a of expiryActions({ id: String(p._id), status: p.status, licenceExpiry: p.licenceExpiry, remindersSent: p.remindersSent }, t)) {
                    if (a.kind === 'expire') {
                        const r = await transition(p, 'expire', { id: 'system', role: 'system', type: 'system' });
                        if (r.ok) {
                            out.expired += 1;
                            await notifyProvider(p, 'Your WelliRecord verification has expired', 'Your licence date has passed, so your account can no longer take consultations. Sign in and apply to renew.');
                        }
                    }
                    else if (a.kind === 'mark_renewal_due') {
                        const r = await transition(p, 'mark_renewal_due', { id: 'system', role: 'system', type: 'system' });
                        if (r.ok)
                            out.renewalDue += 1;
                    }
                    else if (a.kind === 'remind') {
                        await notifyProvider(p, `Your licence expires in ${a.days} days or fewer`, `Your WelliRecord verification depends on your licence date (${p.licenceExpiry}). Sign in and apply to renew before it passes so your access continues.`);
                        p.remindersSent = Array.from(new Set([...(p.remindersSent ?? []), ...a.markSent]));
                        await p.save();
                        await audit({ actorId: 'system', actorType: 'system', action: 'expiry_reminder_sent', subjectType: 'provider', subjectId: String(p._id), detail: { days: a.days } });
                        out.reminders += 1;
                    }
                }
                // Scheduled recheck tasks for the manual queue.
                if (p.nextReviewAt && p.nextReviewAt.getTime() <= t.getTime() && !(await PvRecheck.exists({ providerId: String(p._id), doneAt: { $exists: false } }))) {
                    await PvRecheck.create({ providerId: String(p._id), dueAt: p.nextReviewAt });
                    out.rechecksCreated += 1;
                }
            }
            // Alert once on rechecks that are overdue.
            const overdue = await PvRecheck.find({ doneAt: { $exists: false }, alertedAt: { $exists: false }, dueAt: { $lt: t } });
            for (const o of overdue) {
                console.warn(`[VERIFY] recheck overdue for provider ${o.providerId} (due ${o.dueAt.toISOString()})`);
                if (deps.sendEmail && process.env.PROVIDER_VERIFICATION_ALERT_EMAIL) {
                    await deps.sendEmail(process.env.PROVIDER_VERIFICATION_ALERT_EMAIL, 'A provider recheck is overdue', `A manual credential recheck for provider ${o.providerId} was due ${o.dueAt.toISOString()} and has not been done.`).catch(() => false);
                }
                o.alertedAt = t;
                await o.save();
                await audit({ actorId: 'system', actorType: 'system', action: 'recheck_overdue', subjectType: 'provider', subjectId: String(o.providerId) });
                out.overdueAlerts += 1;
            }
            // Documents: retry scans that could not finish, delete what is past retention.
            if (deps.storage.configured) {
                const pending = await PvDocument.find({ uploadState: 'slot_issued', createdAt: { $lt: new Date(t.getTime() - 3_600_000) }, deletedAt: { $exists: false } }).limit(50);
                for (const d of pending) {
                    d.deletedAt = t;
                    await d.save();
                    try {
                        await deps.storage.deleteObject(d.objectKey);
                    }
                    catch { /* the object may never have been uploaded */ }
                }
                const unscanned = await PvDocument.find({ uploadState: 'uploaded', scanStatus: 'pending', deletedAt: { $exists: false } }).limit(25);
                for (const d of unscanned) {
                    await inspectDocument(d);
                    out.scansRetried += 1;
                }
                const old = await PvDocument.find({ retentionUntil: { $lt: t }, deletedAt: { $exists: false } }).limit(100);
                for (const d of old) {
                    try {
                        await deps.storage.deleteObject(d.objectKey);
                    }
                    catch (err) {
                        console.error('[VERIFY] retention delete failed:', err);
                        continue;
                    }
                    d.deletedAt = t;
                    await d.save();
                    out.documentsDeleted += 1;
                }
            }
        }
        catch (err) {
            console.error('[VERIFY] sweep error:', err);
        }
        return out;
    }
    return { router, canPerform, gateStaff, facilityEligible, auditRecordAccess, eligibleOrgIds, sweep, inspectDocument };
}
/** Starts the hourly job (first run a minute after start). */
export function startVerificationSweep(v) {
    const run = () => { void v.sweep().then((r) => { if (r && !r.skipped && Object.values(r).some((n) => n))
        console.log('[VERIFY] sweep', r); }); };
    setTimeout(run, 60_000).unref();
    setInterval(run, 60 * 60 * 1000).unref();
}
export { LAWFUL_BASES };
