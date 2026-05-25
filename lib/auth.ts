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

export type SessionPayload = {
  username: string;
  expiresAt: number;
  userId?: string;
  displayName?: string;
  role?: string;
  serviceGroups?: string[];
  email?: string;
  department?: string;
  section?: string;
  authSource?: "user" | "fallback";
};

type SessionUser = Partial<Omit<SessionPayload, "expiresAt">> & {
  username?: string;
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

function encodeSessionPayload(payload: SessionPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeSessionPayload(payload: string): SessionPayload | null {
  try {
    const decoded = Buffer.from(payload, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as Partial<SessionPayload>;

    if (!parsed.username || typeof parsed.username !== "string") return null;
    if (!parsed.expiresAt || typeof parsed.expiresAt !== "number") return null;

    return {
      ...parsed,
      username: parsed.username,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

export function getItAuthConfig(): ItAuthConfig | null {
  const username = normalizeEnvValue(process.env.IT_LOGIN_USERNAME);
  const password = process.env.IT_LOGIN_PASSWORD ?? "";
  const secret = getSessionSecret();

  if (!username || !password || !secret) {
    return null;
  }

  return {
    username,
    password,
    secret,
  };
}

export function getSessionSecret() {
  return normalizeEnvValue(process.env.IT_LOGIN_SECRET);
}

export function isValidItCredentials(username: string, password: string) {
  const config = getItAuthConfig();
  if (!config) return false;

  return username.trim().toLowerCase() === config.username.toLowerCase() && password === config.password;
}

export async function createSessionToken(user?: SessionUser): Promise<SessionToken | null> {
  const secret = getSessionSecret();
  const fallbackConfig = getItAuthConfig();
  const username = user?.username?.trim() || fallbackConfig?.username;
  if (!secret || !username) return null;

  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const sessionPayload: SessionPayload = {
    username,
    expiresAt,
    userId: user?.userId,
    displayName: user?.displayName,
    role: user?.role,
    serviceGroups: user?.serviceGroups,
    email: user?.email,
    department: user?.department,
    section: user?.section,
    authSource: user?.authSource ?? "user",
  };
  const payload = encodeSessionPayload(sessionPayload);
  const signature = await signPayload(payload, secret);

  return {
    token: `${payload}.${signature}`,
    expiresAt,
  };
}

export async function verifySessionToken(token?: string | null): Promise<SessionPayload | null> {
  const secret = getSessionSecret();
  if (!secret || !token) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expectedSignature = await signPayload(payload, secret);
  if (!timingSafeEqual(signature, expectedSignature)) {
    return null;
  }

  if (/^\d+$/.test(payload)) {
    const config = getItAuthConfig();
    if (!config) return null;

    const expiresAt = Number(payload);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return null;
    }

    return {
      username: config.username,
      displayName: "IT Operations",
      role: "admin",
      authSource: "fallback",
      expiresAt,
    };
  }

  const session = decodeSessionPayload(payload);
  if (!session || session.expiresAt <= Date.now()) {
    return null;
  }

  return session;
}

export function resolveSafeRedirectPath(path?: string | null) {
  const next = path?.trim();
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/dashboard";
  }
  return next;
}
