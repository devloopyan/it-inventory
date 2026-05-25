"use server";

import { ConvexHttpClient } from "convex/browser";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api } from "@/convex/_generated/api";
import {
  createSessionToken,
  getItAuthConfig,
  getSessionSecret,
  isValidItCredentials,
  resolveSafeRedirectPath,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth";

type AccountSessionUser = {
  userId: string;
  displayName: string;
  username: string;
  email?: string;
  role: string;
  serviceGroups?: string[];
  department?: string;
  section?: string;
};

function buildLoginRedirect(error: "config" | "invalid", next: string) {
  const params = new URLSearchParams({ error });
  if (next !== "/dashboard") {
    params.set("next", next);
  }
  return `/login?${params.toString()}`;
}

async function authenticateUserAccount(username: string, password: string) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return null;

  try {
    const client = new ConvexHttpClient(convexUrl);
    return await client.mutation(api.users.authenticate, { username, password });
  } catch {
    return null;
  }
}

async function setSessionCookie(session: { token: string; expiresAt: number }) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(session.expiresAt),
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function loginAction(formData: FormData) {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = resolveSafeRedirectPath(String(formData.get("next") ?? ""));

  const userAccount = (await authenticateUserAccount(username, password)) as AccountSessionUser | null;
  if (userAccount) {
    const session = await createSessionToken({
      ...userAccount,
      authSource: "user",
    });

    if (!session) {
      redirect(buildLoginRedirect("config", next));
    }

    await setSessionCookie(session);
    redirect(next);
  }

  const fallbackConfigured = Boolean(getItAuthConfig());
  if (fallbackConfigured && isValidItCredentials(username, password)) {
    const session = await createSessionToken({
      username: username.trim(),
      displayName: "IT Operations",
      role: "admin",
      authSource: "fallback",
    });

    if (!session) {
      redirect(buildLoginRedirect("config", next));
    }

    await setSessionCookie(session);
    redirect(next);
  }

  if (!getSessionSecret()) {
    redirect(buildLoginRedirect("config", next));
  }

  redirect(buildLoginRedirect("invalid", next));
}
