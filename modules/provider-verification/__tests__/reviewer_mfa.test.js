import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { totp, verifyTotp, base32Encode, hotp, sealSecret, openSecret } from "../reviewer_totp.js";
import { createReviewerMfa, MAX_WRONG, LOCK_MS } from "../reviewer_mfa.js";

const memStore = () => {
  const m = new Map();
  return { find: async (id) => (m.has(String(id)) ? structuredClone(m.get(String(id))) : null), save: async (d) => { m.set(d.accountId, structuredClone(d)); }, remove: async (id) => { m.delete(String(id)); } };
};

describe("TOTP (RFC 6238 vectors, SHA1)", () => {
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  it("matches the RFC test values", () => {
    assert.equal(totp(secret, 59 * 1000, 8), "94287082");
    assert.equal(totp(secret, 1111111109 * 1000, 8), "07081804");
    assert.equal(totp(secret, 20000000000 * 1000, 8), "65353130");
  });
  it("accepts one step either side, blocks replay, rejects junk", () => {
    const t = 1_700_000_000_000;
    const code = totp(secret, t);
    assert.notEqual(verifyTotp(secret, code, t + 30000), null);
    assert.equal(verifyTotp(secret, code, t + 90000), null);
    const step = verifyTotp(secret, code, t);
    assert.equal(verifyTotp(secret, code, t, step), null);
    assert.equal(verifyTotp(secret, "12345", t), null);
    assert.equal(verifyTotp(secret, undefined, t), null);
  });
  it("seals and opens a secret, and refuses a different key", () => {
    const s = sealSecret("k1", "ABC");
    assert.equal(openSecret("k1", s), "ABC");
    assert.equal(openSecret("k2", s), null);
  });
});

describe("reviewer second step", () => {
  let clock, store, mfa;
  const env = { JWT_SECRET_KEY: "test-signing-key-test-signing-key" };
  beforeEach(() => {
    clock = 1_700_000_000_000;
    store = memStore();
    mfa = createReviewerMfa({ store, now: () => clock, secretKey: () => "seal-key", signKey: () => env.JWT_SECRET_KEY });
  });
  const enrol = async (id = "a1") => {
    const { secret } = await mfa.setup(id, "x@y.ng");
    const r = await mfa.enable(id, totp(secret, clock));
    return { secret, ...r };
  };

  it("not enrolled: check says enrol", async () => {
    assert.deepEqual(await mfa.check("a1", "whatever"), { ok: false, code: "mfa_enrol_required" });
  });
  it("setup only stores a sealed secret and a wrong first code does not enable it", async () => {
    const { secret } = await mfa.setup("a1", "x");
    const d = await store.find("a1");
    assert.ok(!d.sealedSecret.includes(secret));
    await assert.rejects(mfa.enable("a1", "000000"), (e) => e.code === "mfa_bad_code");
    assert.equal((await mfa.status("a1")).enabled, false);
  });
  it("enabling returns 8 recovery codes and a token that passes check", async () => {
    const r = await enrol();
    assert.equal(r.recoveryCodes.length, 8);
    assert.deepEqual(await mfa.check("a1", r.stepUpToken), { ok: true });
  });
  it("a token for another person, a junk token and no token all fail", async () => {
    const a = await enrol("a1");
    await enrol("b2");
    assert.equal((await mfa.check("b2", a.stepUpToken)).ok, false);
    assert.equal((await mfa.check("a1", "junk")).code, "mfa_required");
    assert.equal((await mfa.check("a1", undefined)).code, "mfa_required");
  });
  it("verify needs a fresh code; the same step cannot be used twice", async () => {
    const { secret } = await enrol();
    clock += 60000;
    const code = totp(secret, clock);
    const ok = await mfa.verify("a1", { code });
    assert.equal((await mfa.check("a1", ok.stepUpToken)).ok, true);
    await assert.rejects(mfa.verify("a1", { code }), (e) => e.code === "mfa_bad_code");
  });
  it("five wrong codes lock for 15 minutes, then it works again", async () => {
    const { secret } = await enrol();
    clock += 60000;
    for (let i = 0; i < MAX_WRONG; i++) await assert.rejects(mfa.verify("a1", { code: "000000" }), (e) => e.code === "mfa_bad_code");
    await assert.rejects(mfa.verify("a1", { code: totp(secret, clock) }), (e) => e.code === "mfa_locked" && e.status === 429);
    clock += LOCK_MS + 1000;
    assert.ok((await mfa.verify("a1", { code: totp(secret, clock) })).stepUpToken);
  });
  it("a recovery code works once", async () => {
    const r = await enrol();
    const code = r.recoveryCodes[0];
    const used = await mfa.verify("a1", { recoveryCode: code.toLowerCase() });
    assert.equal(used.recoveryLeft, 7);
    await assert.rejects(mfa.verify("a1", { recoveryCode: code }), (e) => e.code === "mfa_bad_code");
  });
  it("cannot set up again once on; reset lets them, and old tokens die", async () => {
    const first = await enrol();
    await assert.rejects(mfa.setup("a1", "x"), (e) => e.status === 409);
    await mfa.reset("a1");
    assert.equal((await mfa.check("a1", first.stepUpToken)).code, "mfa_enrol_required");
    const second = await enrol();
    assert.equal((await mfa.check("a1", first.stepUpToken)).ok, false);
    assert.equal((await mfa.check("a1", second.stepUpToken)).ok, true);
  });
  it("a token signed with another key is refused", async () => {
    const r = await enrol();
    const other = createReviewerMfa({ store, now: () => clock, secretKey: () => "seal-key", signKey: () => "different-key-different-key-1234" });
    assert.equal((await other.check("a1", r.stepUpToken)).ok, false);
  });
});
