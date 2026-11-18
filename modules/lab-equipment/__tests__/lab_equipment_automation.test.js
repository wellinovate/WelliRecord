import test from "node:test";
import assert from "node:assert/strict";
import { newIngestKey, ingestInstrumentMessage } from "../lab_equipment_automation.js";

test("an ingest key carries the analyzer id and only a hash is kept", () => {
  const id = "a".repeat(24);
  const { key, hash } = newIngestKey(id);
  assert.ok(key.startsWith(`${id}.`));
  assert.equal(hash.length, 64);
  assert.ok(!hash.includes(key.split(".")[1]));
  assert.notEqual(newIngestKey(id).key, key);
});

test("ingest refuses a missing or malformed key before touching the database", async () => {
  for (const k of [undefined, "", "nodot", "short.secret", `${"a".repeat(24)}.`]) {
    await assert.rejects(() => ingestInstrumentMessage({ keyHeader: k, body: {} }), (e) => e.statusCode === 401);
  }
});
