import test from "node:test";
import assert from "node:assert/strict";
import {
  CredentialCryptoError,
  decryptCredential,
  encryptCredential,
  isCredentialStorageConfigured,
} from "./credentialCrypto.ts";

const SECRET = "test-credential-secret-value";

function withSecret(value: string | undefined) {
  if (value === undefined) {
    delete process.env.IT_CREDENTIAL_SECRET;
    return;
  }
  process.env.IT_CREDENTIAL_SECRET = value;
}

test("round-trips a credential", async () => {
  withSecret(SECRET);
  const payload = await encryptCredential("hunter2-Passw0rd!");
  assert.equal(await decryptCredential(payload), "hunter2-Passw0rd!");
});

test("produces the v1 payload shape", async () => {
  withSecret(SECRET);
  const payload = await encryptCredential("abc");
  const parts = payload.split(".");
  assert.equal(parts.length, 3);
  assert.equal(parts[0], "v1");
});

test("uses a fresh IV so identical inputs differ", async () => {
  withSecret(SECRET);
  const first = await encryptCredential("same-value");
  const second = await encryptCredential("same-value");
  assert.notEqual(first, second);
  assert.equal(await decryptCredential(first), "same-value");
  assert.equal(await decryptCredential(second), "same-value");
});

test("rejects a tampered ciphertext", async () => {
  withSecret(SECRET);
  const payload = await encryptCredential("do-not-tamper");
  const [version, iv, cipher] = payload.split(".");
  const flipped = cipher.startsWith("A") ? `B${cipher.slice(1)}` : `A${cipher.slice(1)}`;
  await assert.rejects(
    () => decryptCredential(`${version}.${iv}.${flipped}`),
    (error: Error) => {
      assert.ok(error instanceof CredentialCryptoError);
      assert.match(error.message, /encryption key may have changed/);
      return true;
    },
  );
});

test("rejects an unrecognised payload format", async () => {
  withSecret(SECRET);
  await assert.rejects(
    () => decryptCredential("not-a-valid-payload"),
    (error: Error) => error instanceof CredentialCryptoError,
  );
});

test("rejects a payload from a different key", async () => {
  withSecret(SECRET);
  const payload = await encryptCredential("cross-key");
  withSecret("a-completely-different-secret");
  await assert.rejects(
    () => decryptCredential(payload),
    (error: Error) => error instanceof CredentialCryptoError,
  );
});

test("reports storage unconfigured and refuses to encrypt without a key", async () => {
  withSecret(undefined);
  assert.equal(isCredentialStorageConfigured(), false);
  await assert.rejects(
    () => encryptCredential("no-key"),
    (error: Error) => {
      assert.ok(error instanceof CredentialCryptoError);
      assert.match(error.message, /not configured/);
      return true;
    },
  );
  withSecret(SECRET);
  assert.equal(isCredentialStorageConfigured(), true);
});

test("treats a whitespace-only secret as unconfigured", () => {
  withSecret("   ");
  assert.equal(isCredentialStorageConfigured(), false);
});
