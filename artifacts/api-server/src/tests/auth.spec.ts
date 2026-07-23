import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";

// auth.ts throws at import time if SESSION_SECRET is unset, so it must be
// configured before the dynamic import below runs.
process.env.SESSION_SECRET ??= "test-session-secret";

const { validatePortugueseNif } = await import("../routes/auth.js");

test("validatePortugueseNif: accepts a known-valid NIF", () => {
  // 123456789 is not a real check-digit match; use a value that satisfies
  // the mod-11 algorithm implemented in validatePortugueseNif.
  assert.equal(validatePortugueseNif("501442600"), true);
});

test("validatePortugueseNif: rejects a NIF with a wrong check digit", () => {
  assert.equal(validatePortugueseNif("501442601"), false);
});

test("validatePortugueseNif: rejects a NIF starting with an invalid first digit", () => {
  assert.equal(validatePortugueseNif("401442600"), false);
});

test("validatePortugueseNif: rejects strings that aren't 9 digits", () => {
  assert.equal(validatePortugueseNif("12345"), false);
  assert.equal(validatePortugueseNif("abcdefghi"), false);
  assert.equal(validatePortugueseNif(""), false);
});

test("validatePortugueseNif: ignores embedded whitespace", () => {
  assert.equal(validatePortugueseNif("501 442 600"), true);
});

test("password hashing: bcrypt round-trip accepts the original password and rejects others", async () => {
  const hash = await bcrypt.hash("correct horse battery staple", 10);
  assert.equal(await bcrypt.compare("correct horse battery staple", hash), true);
  assert.equal(await bcrypt.compare("wrong password", hash), false);
});

test("password hashing: never stores the plaintext password", async () => {
  const password = "correct horse battery staple";
  const hash = await bcrypt.hash(password, 10);
  assert.notEqual(hash, password);
  assert.ok(hash.startsWith("$2"));
});
