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

  const client = getConvexClient();

  if (!value) {
    // Nothing was typed. If nothing was stored either, this is a no-op — skip
    // the Convex write so we don't append a spurious "clear" row to the audit
    // log for a record that never had a password. Reusing getAccountCipher
    // (already used by revealAccountPassword) avoids adding a new public
    // Convex function just to answer "is one stored?".
    const existing = await client.query(api.digitalInventory.getAccountCipher, {
      recordId: recordId as Id<"accessAccountsInventory">,
    });
    if (!existing?.passwordCipher) {
      return { ok: true as const };
    }
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

  await client.mutation(api.digitalInventory.setAccountPassword, {
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
