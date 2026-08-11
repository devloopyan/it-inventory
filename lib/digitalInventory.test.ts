import test from "node:test";
import assert from "node:assert/strict";
import {
  MFA_METHODS,
  MFA_METHOD_NONE,
  isMfaMethod,
  normalizeMfaMethod,
} from "./digitalInventory.ts";

test("None is the first method and the exported default", () => {
  assert.equal(MFA_METHODS[0], "None");
  assert.equal(MFA_METHOD_NONE, "None");
});

test("lists exactly the six agreed methods", () => {
  assert.deepEqual([...MFA_METHODS], [
    "None",
    "Authenticator App",
    "SMS",
    "Email",
    "Hardware Key",
    "Backup Codes",
  ]);
});

test("recognises valid methods only", () => {
  assert.equal(isMfaMethod("Hardware Key"), true);
  assert.equal(isMfaMethod("hardware key"), false);
  assert.equal(isMfaMethod("Carrier Pigeon"), false);
});

test("normalizes unknown, empty, and missing values to None", () => {
  assert.equal(normalizeMfaMethod("Carrier Pigeon"), "None");
  assert.equal(normalizeMfaMethod(""), "None");
  assert.equal(normalizeMfaMethod(undefined), "None");
  assert.equal(normalizeMfaMethod("  SMS  "), "SMS");
});
