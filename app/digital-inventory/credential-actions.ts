"use server";

import { ConvexHttpClient } from "convex/browser";
import { cookies } from "next/headers";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import {
  CredentialCryptoError,
  decryptCredential,
  encryptCredential,
  isCredentialStorageConfigured,
} from "@/lib/credentialCrypto";
import { isAdminRole } from "@/lib/roles";

async function requireAdminSession() {
  const cookieStore = await cookies();
  const session = await verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  if (!session) {
    throw new Error("Your session has expired. Sign in again.");
  }
  if (!isAdminRole(session.role)) {
    throw new Error("Only IT admins can manage account passwords.");
  }

  return session;
}

function getConvexClient() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("Convex is not configured.");
  }
  return new ConvexHttpClient(convexUrl);
}

export async function saveAccountPassword(recordId: string, plaintext: string) {
  const session = await requireAdminSession();

  const value = plaintext.trim();
  if (value && !isCredentialStorageConfigured()) {
    throw new Error("Credential storage not configured.");
  }

  let passwordCipher: string | undefined;
  if (value) {
    try {
      passwordCipher = await encryptCredential(value);
    } catch (error) {
      throw new Error(
        error instanceof CredentialCryptoError ? error.message : "Could not encrypt the password.",
      );
    }
  }

  await getConvexClient().mutation(api.digitalInventory.setAccountPassword, {
    recordId: recordId as Id<"accessAccountsInventory">,
    passwordCipher,
    actorUsername: session.username,
  });

  return { ok: true as const };
}

export async function revealAccountPassword(recordId: string) {
  const session = await requireAdminSession();

  if (!isCredentialStorageConfigured()) {
    throw new Error("Credential storage not configured.");
  }

  const client = getConvexClient();
  const record = await client.query(api.digitalInventory.getAccountCipher, {
    recordId: recordId as Id<"accessAccountsInventory">,
  });

  if (!record?.passwordCipher) {
    throw new Error("No password is stored for this account.");
  }

  let password: string;
  try {
    password = await decryptCredential(record.passwordCipher);
  } catch (error) {
    throw new Error(
      error instanceof CredentialCryptoError
        ? error.message
        : "Could not decrypt — the encryption key may have changed.",
    );
  }

  await client.mutation(api.digitalInventory.logCredentialReveal, {
    recordId: recordId as Id<"accessAccountsInventory">,
    actorUsername: session.username,
  });

  return { password };
}
