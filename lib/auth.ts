const encoder = new TextEncoder();

export const SESSION_COOKIE_NAME = "it_inventory_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

type ItAuthConfig = {
  username: string;
  password: string;
  secret: string;
};

type SessionToken = {
  token: string;
  expiresAt: number;
};

type SessionPayload = {
  username: string;
  expiresAt: number;
};

function normalizeEnvValue(value?: string) {
  const next = value?.trim();
  return next ? next : "";
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

async function signPayload(payload: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toHex(new Uint8Array(signature));
}

export function getItAuthConfig(): ItAuthConfig | null {
  const username = normalizeEnvValue(process.env.IT_LOGIN_USERNAME);
  const password = process.env.IT_LOGIN_PASSWORD ?? "";
  const secret = normalizeEnvValue(process.env.IT_LOGIN_SECRET);

  if (!username || !password || !secret) {
    return null;
  }

  return {
    username,
    password,
    secret,
  };
}

export function isValidItCredentials(username: string, password: string) {
  const config = getItAuthConfig();
  if (!config) return false;

  return username.trim().toLowerCase() === config.username.toLowerCase() && password === config.password;
}

export async function createSessionToken(): Promise<SessionToken | null> {
  const config = getItAuthConfig();
  if (!config) return null;

  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = String(expiresAt);
  const signature = await signPayload(payload, config.secret);

  return {
    token: `${payload}.${signature}`,
    expiresAt,
  };
}

export async function verifySessionToken(token?: string | null): Promise<SessionPayload | null> {
  const config = getItAuthConfig();
  if (!config || !token) return null;

  const [expiresAtRaw, signature] = token.split(".");
  if (!expiresAtRaw || !signature) return null;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return null;
  }

  const expectedSignature = await signPayload(expiresAtRaw, config.secret);
  if (!timingSafeEqual(signature, expectedSignature)) {
    return null;
  }

  return {
    username: config.username,
    expiresAt,
  };
}

export function resolveSafeRedirectPath(path?: string | null) {
  const next = path?.trim();
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/dashboard";
  }
  return next;
}
