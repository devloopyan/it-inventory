const encoder = new TextEncoder();
const decoder = new TextDecoder();

const CIPHER_VERSION = "v1";
const IV_BYTES = 12;

export class CredentialCryptoError extends Error {}

function toBase64Url(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}

function fromBase64Url(value: string) {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

function getCredentialSecret() {
  const value = process.env.IT_CREDENTIAL_SECRET?.trim();
  return value ? value : "";
}

export function isCredentialStorageConfigured() {
  return Boolean(getCredentialSecret());
}

async function getKey() {
  const secret = getCredentialSecret();
  if (!secret) {
    throw new CredentialCryptoError("Credential storage is not configured.");
  }

  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptCredential(plaintext: string) {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plaintext));

  return `${CIPHER_VERSION}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(cipher))}`;
}

export async function decryptCredential(payload: string) {
  const [version, ivPart, cipherPart] = payload.split(".");
  if (version !== CIPHER_VERSION || !ivPart || !cipherPart) {
    throw new CredentialCryptoError("Stored credential format is not recognised.");
  }

  const key = await getKey();

  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64Url(ivPart) },
      key,
      fromBase64Url(cipherPart),
    );
    return decoder.decode(plain);
  } catch {
    throw new CredentialCryptoError("Could not decrypt — the encryption key may have changed.");
  }
}
