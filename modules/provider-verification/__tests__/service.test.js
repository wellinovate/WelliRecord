import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderVerification, enforcementOn } from '../verification_service.js';
import { createS3Storage } from '../doc_storage.js';
const deps = () => ({
    requireStaff: () => (_req, _res, next) => next(),
    limiter: (_req, _res, next) => next(),
    getAuthUserId: () => null,
    storage: createS3Storage(null),
    scanner: { configured: false, scan: async () => 'error' },
});
// These run without a database: the database is not connected, so every gate must fail closed.
test('gate denies when the database is not connected', async () => {
    delete process.env.PROVIDER_VERIFICATION_ENFORCE;
    const v = createProviderVerification(deps());
    const r = await v.canPerform({ staffUserId: 'abc' }, 'start_consultation');
    assert.equal(r.eligible, false);
    assert.equal(r.reason, 'error');
});
test('search filter hides practitioners when the database is not connected', async () => {
    const v = createProviderVerification(deps());
    assert.equal((await v.eligibleOrgIds(['org1'])).size, 0);
});
test('a facility with clinicians assigned is not bookable when none can be checked', async () => {
    const v = createProviderVerification(deps());
    assert.equal(await v.facilityEligible(['staff1'], 'f1'), false);
    assert.equal(await v.facilityEligible([], 'f1'), true);
});
test('the enforcement switch only turns off with an explicit false', () => {
    process.env.PROVIDER_VERIFICATION_ENFORCE = 'false';
    assert.equal(enforcementOn(), false);
    process.env.PROVIDER_VERIFICATION_ENFORCE = 'maybe';
    assert.equal(enforcementOn(), true);
    delete process.env.PROVIDER_VERIFICATION_ENFORCE;
    assert.equal(enforcementOn(), true);
});
test('record access audit refuses a missing lawful basis', async () => {
    const v = createProviderVerification(deps());
    await assert.rejects(() => v.auditRecordAccess({ staffUserId: 's', patientRef: 'p', purpose: 'care', lawfulBasis: '' }));
});
