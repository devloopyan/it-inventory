"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createSessionToken,
  getItAuthConfig,
  isValidItCredentials,
  resolveSafeRedirectPath,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth";

function buildLoginRedirect(error: "config" | "invalid", next: string) {
  const params = new URLSearchParams({ error });
  if (next !== "/dashboard") {
    params.set("next", next);
  }
  return `/login?${params.toString()}`;
}

export async function loginAction(formData: FormData) {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = resolveSafeRedirectPath(String(formData.get("next") ?? ""));

  if (!getItAuthConfig()) {
    redirect(buildLoginRedirect("config", next));
  }

  if (!isValidItCredentials(username, password)) {
    redirect(buildLoginRedirect("invalid", next));
  }

  const session = await createSessionToken();
  if (!session) {
    redirect(buildLoginRedirect("config", next));
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(session.expiresAt),
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  redirect(next);
}
