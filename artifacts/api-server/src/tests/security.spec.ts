import test from "node:test";
import assert from "node:assert/strict";

import { timingSafeEqualString } from "../lib/security.js";

test("timingSafeEqualString: identical strings are equal", () => {
  assert.equal(timingSafeEqualString("supersecret", "supersecret"), true);
});

test("timingSafeEqualString: different strings of the same length are not equal", () => {
  assert.equal(timingSafeEqualString("supersecret", "superSecret"), false);
});

test("timingSafeEqualString: strings of different lengths are not equal", () => {
  assert.equal(timingSafeEqualString("short", "a-much-longer-secret"), false);
});

test("timingSafeEqualString: empty strings are equal to each other", () => {
  assert.equal(timingSafeEqualString("", ""), true);
});

test("timingSafeEqualString: empty vs non-empty is not equal", () => {
  assert.equal(timingSafeEqualString("", "x"), false);
});
