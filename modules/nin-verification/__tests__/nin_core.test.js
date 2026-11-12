import test from "node:test";
import assert from "node:assert/strict";
import { cleanNin, dobMatches, lagosDate, matchIdentity, namesMatch, normalizeName, profileComplete } from "../nin_core.js";

test("an NIN is exactly 11 digits; spaces and dashes are ignored", () => {
  assert.equal(cleanNin("11111111111"), "11111111111");
  assert.equal(cleanNin("1111 1111-111"), "11111111111");
  for (const bad of ["1111111111", "111111111111", "abcdefghijk", "", null, undefined, {}, ["11111111111"]]) assert.equal(cleanNin(bad), null, String(bad));
});

test("names compare without accents, case or punctuation", () => {
  assert.equal(normalizeName("  Chínedu-Ọkafor "), "chinedu okafor");
});

test("first and last name on the NIN must both be in the profile, in any order", () => {
  const rec = { firstName: "Chinedu", lastName: "Okafor" };
  assert.equal(namesMatch({ fullName: "Chinedu Ike Okafor" }, rec), true);
  assert.equal(namesMatch({ fullName: "Okafor Chinedu" }, rec), true);
  assert.equal(namesMatch({ firstName: "chinedu", lastName: "OKAFOR" }, rec), true);
  assert.equal(namesMatch({ fullName: "Chinedu Eze" }, rec), false);
  assert.equal(namesMatch({ fullName: "Ngozi Okafor" }, rec), false);
  assert.equal(namesMatch({ fullName: "Chinedu Okafor" }, { firstName: "", lastName: "Okafor" }), false);
});

test("a shorter name does not match a longer one by prefix", () => {
  assert.equal(namesMatch({ fullName: "Chi Okafor" }, { firstName: "Chinedu", lastName: "Okafor" }), false);
});

test("dates match on the Lagos calendar day, whether stored as UTC midnight or Lagos midnight", () => {
  assert.equal(lagosDate(new Date("1990-05-14T00:00:00Z")), "1990-05-14");
  assert.equal(lagosDate(new Date("1990-05-13T23:00:00Z")), "1990-05-14");
  assert.equal(lagosDate("1990-05-14T00:00:00.000Z"), "1990-05-14");
  assert.equal(dobMatches(new Date("1990-05-13T23:00:00Z"), "1990-05-14"), true);
  assert.equal(dobMatches(new Date("1990-05-15T00:00:00Z"), "1990-05-14"), false);
  assert.equal(dobMatches(null, "1990-05-14"), false);
  assert.equal(dobMatches("1990-05-14", "not a date"), false);
});

test("an identity matches only when both name and date of birth match", () => {
  const profile = { fullName: "Chinedu Okafor", dateOfBirth: new Date("1990-05-14T00:00:00Z") };
  const rec = { firstName: "Chinedu", lastName: "Okafor", dateOfBirth: "1990-05-14" };
  assert.deepEqual(matchIdentity(profile, rec), { name: true, dob: true, ok: true });
  assert.equal(matchIdentity(profile, { ...rec, dateOfBirth: "1990-05-15" }).ok, false);
  assert.equal(matchIdentity(profile, { ...rec, lastName: "Eze" }).ok, false);
});

test("a profile needs two names and a date of birth before a paid lookup", () => {
  assert.equal(profileComplete({ fullName: "Chinedu Okafor", dateOfBirth: "1990-05-14" }), true);
  assert.equal(profileComplete({ fullName: "Chinedu", dateOfBirth: "1990-05-14" }), false);
  assert.equal(profileComplete({ fullName: "Chinedu Okafor" }), false);
});
