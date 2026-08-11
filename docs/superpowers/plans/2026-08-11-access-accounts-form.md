# Access & Accounts Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Access & Accounts form in Digital Inventory around 11 fields, with the account password stored AES-256-GCM encrypted and revealable only by IT admins through a server action.

**Architecture:** Convex holds the record and the ciphertext but never the key. Auth in this app is an HMAC-signed cookie verified in Next.js (`lib/auth.ts`); Convex functions have no auth context, so all credential reads and writes route through Next.js server actions that verify the cookie, check the role, and hold `IT_CREDENTIAL_SECRET`. Everything non-credential keeps calling Convex directly from the browser as it does today.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, Convex 1.32, Web Crypto (`crypto.subtle`), `node:test` with native TypeScript type-stripping (Node 24).

## Global Constraints

- The 11 form fields are exactly: System/Platform, Email/Username, Password, Recovery Email/Phone, Owner/Admin, Who Else Has Access, MFA, MFA Registered To, Status, Last Reviewed, Notes. Do not add a twelfth.
- MFA is **one** select, not a checkbox plus a method box. `MFA_METHODS` = `None`, `Authenticator App`, `SMS`, `Email`, `Hardware Key`, `Backup Codes`. `None` is the default and means MFA is off.
- `mfaEnabled` stays in the Convex schema as a derived boolean (`mfaMethod !== "None"`), set server-side on every write. It is never sent from the form.
- Removed everywhere: `accountType`, `department`, `accessLevel`, `vaultReference`. `ownerName` is renamed to `ownerUsername`.
- Encryption key comes from `IT_CREDENTIAL_SECRET`. If it is unset, the Password field renders disabled with the exact copy `Credential storage not configured.` It must never fall back to storing plaintext.
- Cipher payload format is exactly `v1.<iv base64url>.<ciphertext base64url>`.
- Decrypt failure surfaces the exact copy `Could not decrypt — the encryption key may have changed.`
- Modal subtitle for the accounts tab becomes exactly: `Passwords are encrypted. Only IT admins can reveal them, and every reveal is logged.`
- Admin check is `isAdminRole()` from `lib/roles.ts` (owner + admin only).
- The password ciphertext must never be returned by `listAccessAccounts` and never rendered in the table.
- Only Task 1 has a real test runner. Every other task verifies with `npx tsc --noEmit`, `npm run lint`, and the manual steps written into that task.
- Only `systemName` and `accountName` are required fields.

---

### Task 1: Credential crypto module

**Files:**
- Create: `lib/credentialCrypto.ts`
- Create: `lib/credentialCrypto.test.ts`
- Modify: `package.json:5-10` (add `test` script)

**Interfaces:**
- Consumes: nothing
- Produces:
  - `isCredentialStorageConfigured(): boolean`
  - `encryptCredential(plaintext: string): Promise<string>`
  - `decryptCredential(payload: string): Promise<string>`
  - `class CredentialCryptoError extends Error`

Node 24 strips TypeScript types natively, so `node --test lib/credentialCrypto.test.ts` runs a `.ts` test with no loader, no transpiler, and no new dependency. Keep the module to erasable syntax only — no `enum`, no constructor parameter properties.

Both `encryptCredential` and `decryptCredential` read `process.env.IT_CREDENTIAL_SECRET` **at call time, not at module load**. The tests depend on this: they mutate the env var between cases.

- [ ] **Step 1: Write the failing test**

Create `lib/credentialCrypto.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test lib/credentialCrypto.test.ts
```

Expected: FAIL — `Cannot find module './credentialCrypto.ts'`.

- [ ] **Step 3: Write the implementation**

Create `lib/credentialCrypto.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node --test lib/credentialCrypto.test.ts
```

Expected: PASS, 8 tests.

If Node complains about stripping types, rerun as `node --test --experimental-strip-types lib/credentialCrypto.test.ts`. If that also fails, the Node version is below 22.6 — stop and report it rather than adding a transpiler.

- [ ] **Step 5: Add the test script**

In `package.json`, inside `"scripts"`, after the `"lint"` entry:

```json
    "lint": "eslint",
    "test": "node --test \"lib/**/*.test.ts\""
```

- [ ] **Step 6: Verify the script and typecheck**

```bash
npm test
npx tsc --noEmit
```

Expected: tests PASS; `tsc` reports no errors.

- [ ] **Step 7: Document the env var**

Create `.env.example` if it does not exist, otherwise append:

```
# Secret used to encrypt Access & Accounts passwords (AES-256-GCM).
# Without it the Password field is disabled. Rotating it makes existing stored passwords undecryptable.
IT_CREDENTIAL_SECRET=
```

Then set a real value in the local `.env.local` so the rest of the plan can be tested end to end.

- [ ] **Step 8: Commit**

```bash
git add lib/credentialCrypto.ts lib/credentialCrypto.test.ts package.json .env.example
git commit -m "feat: add AES-GCM credential crypto for access account passwords"
```

---

### Task 2: MFA constants

**Files:**
- Modify: `lib/digitalInventory.ts:9-15` (add after `ACCESS_ACCOUNT_STATUSES`), `lib/digitalInventory.ts:44-46` (add guard near `isAccessAccountStatus`)
- Create: `lib/digitalInventory.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `MFA_METHODS: readonly ["None", "Authenticator App", "SMS", "Email", "Hardware Key", "Backup Codes"]`
  - `MFA_METHOD_NONE: "None"`
  - `type MfaMethod`
  - `isMfaMethod(value: string): value is MfaMethod`
  - `normalizeMfaMethod(value?: string): MfaMethod` — returns `"None"` for anything unrecognised, so a bad value degrades to "no MFA" rather than throwing

- [ ] **Step 1: Write the failing test**

Create `lib/digitalInventory.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test lib/digitalInventory.test.ts
```

Expected: FAIL — `MFA_METHODS` is not exported.

- [ ] **Step 3: Add the constants**

In `lib/digitalInventory.ts`, after the `ACCESS_ACCOUNT_STATUSES` block (line 15):

```ts
export const MFA_METHODS = [
  "None",
  "Authenticator App",
  "SMS",
  "Email",
  "Hardware Key",
  "Backup Codes",
] as const;

export const MFA_METHOD_NONE = "None";
```

Add the type alongside the other type exports:

```ts
export type MfaMethod = (typeof MFA_METHODS)[number];
```

Add the guards next to `isAccessAccountStatus`:

```ts
export function isMfaMethod(value: string): value is MfaMethod {
  return (MFA_METHODS as readonly string[]).includes(value);
}

export function normalizeMfaMethod(value?: string): MfaMethod {
  const next = value?.trim() ?? "";
  return isMfaMethod(next) ? next : MFA_METHOD_NONE;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test
npx tsc --noEmit
```

Expected: all tests PASS across both test files; no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/digitalInventory.ts lib/digitalInventory.test.ts
git commit -m "feat: add MFA method constants for access accounts"
```

---

### Task 3: Convex schema

**Files:**
- Modify: `convex/schema.ts:443-460`

**Interfaces:**
- Consumes: nothing
- Produces: the `accessAccountsInventory` shape and the `credentialAccessLog` table that Task 4 writes to.

This is a destructive schema change. `accountType`, `department`, `accessLevel`, and `vaultReference` are dropped and their data is lost, and `ownerName` becomes `ownerUsername` without carrying values over. This was accepted in the spec.

- [ ] **Step 1: Export existing rows before changing anything**

```bash
npx convex export --path ./convex-backup-access-accounts.zip
```

Add `convex-backup-*.zip` to `.gitignore` if it is not already covered. Do not commit the export.

Expected: a zip is written. If the export fails, stop — do not proceed with a destructive schema change without a backup.

- [ ] **Step 2: Replace the table definition**

In `convex/schema.ts`, replace the whole `accessAccountsInventory` block (lines 443-460) with:

```ts
  accessAccountsInventory: defineTable({
    systemName: v.string(),
    accountName: v.string(),
    recoveryContact: v.optional(v.string()),
    ownerUsername: v.optional(v.string()),
    sharedWithUsernames: v.optional(v.array(v.string())),
    mfaEnabled: v.boolean(),
    mfaMethod: v.optional(v.string()),
    mfaRegisteredTo: v.optional(v.string()),
    lastReviewedDate: v.optional(v.string()),
    status: v.string(),
    notes: v.optional(v.string()),
    passwordCipher: v.optional(v.string()),
    passwordUpdatedAt: v.optional(v.number()),
    passwordUpdatedBy: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_lastReviewedDate", ["lastReviewedDate"])
    .index("by_updatedAt", ["updatedAt"]),
  credentialAccessLog: defineTable({
    recordId: v.id("accessAccountsInventory"),
    actorUsername: v.string(),
    action: v.string(),
    at: v.number(),
  }).index("by_recordId", ["recordId"]),
```

- [ ] **Step 3: Clear incompatible rows**

Existing rows still carry the four removed fields, which the new validator rejects. In the Convex dashboard, delete all `accessAccountsInventory` documents. The backup from Step 1 holds the old data.

- [ ] **Step 4: Push and verify the schema**

```bash
npx convex dev --once
```

Expected: schema pushes with no validation error. A `Document with ID ... does not match validator` error means Step 3 was incomplete — finish clearing the table.

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts .gitignore
git commit -m "feat: reshape access accounts schema and add credential access log"
```

---

### Task 4: Convex access account functions

**Files:**
- Modify: `convex/digitalInventory.ts:110-123` (search matcher), `convex/digitalInventory.ts:233-309` (list, create, update)

**Interfaces:**
- Consumes: `normalizeMfaMethod`, `MFA_METHOD_NONE` from Task 2; the schema from Task 3
- Produces:
  - `listAccessAccounts({ search?: string })` — returns rows **without** `passwordCipher`, plus `hasPassword: boolean`
  - `createAccessAccount(args) => Id<"accessAccountsInventory">`
  - `updateAccessAccount({ recordId, ...args }) => { success: true }`
  - `setAccountPassword({ recordId, passwordCipher?, actorUsername }) => { success: true }`
  - `getAccountCipher({ recordId }) => { passwordCipher: string | null } | null`
  - `logCredentialReveal({ recordId, actorUsername }) => { success: true }`

Shared write args for create and update:

```
systemName: v.string()
accountName: v.string()
recoveryContact: v.optional(v.string())
ownerUsername: v.optional(v.string())
sharedWithUsernames: v.optional(v.array(v.string()))
mfaMethod: v.optional(v.string())
mfaRegisteredTo: v.optional(v.string())
lastReviewedDate: v.optional(v.string())
status: v.optional(v.string())
notes: v.optional(v.string())
```

`mfaEnabled` is absent by design — it is derived.

- [ ] **Step 1: Import the MFA helpers**

In `convex/digitalInventory.ts`, add to the existing import block from `"../lib/digitalInventory"`:

```ts
  MFA_METHOD_NONE,
  normalizeMfaMethod,
```

- [ ] **Step 2: Add the shared field normalizer**

Add below `ensureAccessAccountStatus` (after line 56). This is the single place MFA derivation and shared-user filtering happen, so create and update cannot drift apart:

Add `import type { MutationCtx } from "./_generated/server";` to the imports at the top of the file first — use the generated context type rather than hand-writing a structural one.

```ts
async function buildAccessAccountFields(
  ctx: MutationCtx,
  args: {
    systemName: string;
    accountName: string;
    recoveryContact?: string;
    ownerUsername?: string;
    sharedWithUsernames?: string[];
    mfaMethod?: string;
    mfaRegisteredTo?: string;
    lastReviewedDate?: string;
    status?: string;
    notes?: string;
  },
) {
  const mfaMethod = normalizeMfaMethod(args.mfaMethod);
  const mfaEnabled = mfaMethod !== MFA_METHOD_NONE;

  const activeUsernames = new Set(
    (await ctx.db.query("users").collect())
      .filter((row) => row.active)
      .map((row) => row.username),
  );
  const sharedWithUsernames = (args.sharedWithUsernames ?? [])
    .map((username) => username.trim())
    .filter((username) => username && activeUsernames.has(username));

  return {
    systemName: normalizeRequired(args.systemName, "System name"),
    accountName: normalizeRequired(args.accountName, "Email or username"),
    recoveryContact: normalizeOptional(args.recoveryContact),
    ownerUsername: normalizeOptional(args.ownerUsername),
    sharedWithUsernames: sharedWithUsernames.length ? sharedWithUsernames : undefined,
    mfaEnabled,
    mfaMethod,
    mfaRegisteredTo: mfaEnabled ? normalizeOptional(args.mfaRegisteredTo) : undefined,
    lastReviewedDate: normalizeOptional(args.lastReviewedDate),
    status: ensureAccessAccountStatus(args.status),
    notes: normalizeOptional(args.notes),
  };
}
```

- [ ] **Step 3: Update the search matcher**

Replace `matchesAccessAccountSearch` (lines 110-123):

```ts
function matchesAccessAccountSearch(row: AccessAccountDoc, search?: string) {
  return matchesSearch(
    [
      row.systemName,
      row.accountName,
      row.recoveryContact,
      row.ownerUsername,
      ...(row.sharedWithUsernames ?? []),
      row.mfaMethod,
      row.mfaRegisteredTo,
      row.mfaEnabled ? "mfa yes enabled" : "mfa no disabled",
      row.lastReviewedDate,
      row.status,
      row.notes,
    ],
    search,
  );
}
```

The password is deliberately not searchable.

- [ ] **Step 4: Strip the cipher out of the list query**

Replace `listAccessAccounts` (lines 233-241):

```ts
export const listAccessAccounts = query({
  args: {
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("accessAccountsInventory").withIndex("by_updatedAt").order("desc").collect();
    return rows
      .filter((row) => matchesAccessAccountSearch(row, args.search))
      .map(({ passwordCipher, ...row }) => ({
        ...row,
        hasPassword: Boolean(passwordCipher),
      }));
  },
});
```

The ciphertext never reaches the browser through the list. `hasPassword` is what the form uses to decide between "Set" and "Not set".

- [ ] **Step 5: Rewrite create and update**

Replace `createAccessAccount` and `updateAccessAccount` (lines 243-309):

```ts
const accessAccountWriteArgs = {
  systemName: v.string(),
  accountName: v.string(),
  recoveryContact: v.optional(v.string()),
  ownerUsername: v.optional(v.string()),
  sharedWithUsernames: v.optional(v.array(v.string())),
  mfaMethod: v.optional(v.string()),
  mfaRegisteredTo: v.optional(v.string()),
  lastReviewedDate: v.optional(v.string()),
  status: v.optional(v.string()),
  notes: v.optional(v.string()),
};

export const createAccessAccount = mutation({
  args: accessAccountWriteArgs,
  handler: async (ctx, args) => {
    const now = Date.now();
    const fields = await buildAccessAccountFields(ctx, args);
    return await ctx.db.insert("accessAccountsInventory", {
      ...fields,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateAccessAccount = mutation({
  args: {
    recordId: v.id("accessAccountsInventory"),
    ...accessAccountWriteArgs,
  },
  handler: async (ctx, args) => {
    const fields = await buildAccessAccountFields(ctx, args);
    await ctx.db.patch(args.recordId, {
      ...fields,
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});
```

`removeAccessAccount` (line 311) is unchanged.

- [ ] **Step 6: Add the credential functions**

Append after `removeAccessAccount`. These are called only from the Task 5 server actions:

```ts
export const getAccountCipher = query({
  args: {
    recordId: v.id("accessAccountsInventory"),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.recordId);
    if (!row) return null;
    return { passwordCipher: row.passwordCipher ?? null };
  },
});

export const setAccountPassword = mutation({
  args: {
    recordId: v.id("accessAccountsInventory"),
    passwordCipher: v.optional(v.string()),
    actorUsername: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const cleared = !args.passwordCipher;

    await ctx.db.patch(args.recordId, {
      passwordCipher: args.passwordCipher,
      passwordUpdatedAt: cleared ? undefined : now,
      passwordUpdatedBy: cleared ? undefined : args.actorUsername,
      updatedAt: now,
    });

    await ctx.db.insert("credentialAccessLog", {
      recordId: args.recordId,
      actorUsername: args.actorUsername,
      action: cleared ? "clear" : "update",
      at: now,
    });

    return { success: true };
  },
});

export const logCredentialReveal = mutation({
  args: {
    recordId: v.id("accessAccountsInventory"),
    actorUsername: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("credentialAccessLog", {
      recordId: args.recordId,
      actorUsername: args.actorUsername,
      action: "reveal",
      at: Date.now(),
    });
    return { success: true };
  },
});
```

- [ ] **Step 7: Verify**

```bash
npx convex dev --once
npx tsc --noEmit
```

Expected: functions deploy; no type errors. The client still references removed fields at this point, so `tsc` will report errors in `app/digital-inventory/digital-inventory-client.tsx` — those are expected and get fixed in Task 7. Errors in any other file are not expected.

- [ ] **Step 8: Commit**

```bash
git add convex/digitalInventory.ts
git commit -m "feat: rework access account convex functions for new fields and credentials"
```

---

### Task 5: Credential server actions

**Files:**
- Create: `app/digital-inventory/credential-actions.ts`

**Interfaces:**
- Consumes: `encryptCredential`, `decryptCredential`, `CredentialCryptoError`, `isCredentialStorageConfigured` (Task 1); `setAccountPassword`, `getAccountCipher`, `logCredentialReveal` (Task 4); `verifySessionToken`, `SESSION_COOKIE_NAME` (`lib/auth.ts`); `isAdminRole` (`lib/roles.ts`)
- Produces:
  - `saveAccountPassword(recordId: string, plaintext: string): Promise<{ ok: true }>` — throws `Error` with a user-safe message on failure
  - `revealAccountPassword(recordId: string): Promise<{ password: string }>` — throws `Error` with a user-safe message on failure

Both actions re-check the session and role server-side. The client-side role check added in Task 7 is only for hiding buttons; this is the check that actually enforces anything.

- [ ] **Step 1: Write the module**

Create `app/digital-inventory/credential-actions.ts`:

```ts
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
```

The reveal log is written **before** the value is returned, so a reveal cannot be unlogged.

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
npm run lint
```

Expected: no new errors in `credential-actions.ts`. Pre-existing errors in `digital-inventory-client.tsx` from Task 4 remain until Task 7.

- [ ] **Step 3: Commit**

```bash
git add app/digital-inventory/credential-actions.ts
git commit -m "feat: add admin-gated server actions for account password save and reveal"
```

---

### Task 6: Staff picker and password field components

**Files:**
- Create: `app/digital-inventory/staff-picker.tsx`
- Create: `app/digital-inventory/password-field.tsx`
- Modify: `app/globals.css` (append after the `.digital-textarea` block, around line 16849)

**Interfaces:**
- Consumes: `revealAccountPassword` (Task 5)
- Produces:
  - `<OwnerSelect value onChange options />`
  - `<SharedAccessPicker value onChange options />`
  - `type StaffOption = { username: string; displayName: string }`
  - `<PasswordField mode recordId storageConfigured canReveal hasStoredPassword passwordUpdatedAt passwordUpdatedBy draft onDraftChange onError />`

Splitting these into their own files keeps `digital-inventory-client.tsx` from growing past its current 934 lines while Task 7 adds sections to it.

- [ ] **Step 1: Write the staff picker**

Create `app/digital-inventory/staff-picker.tsx`:

```tsx
"use client";

export type StaffOption = {
  username: string;
  displayName: string;
};

export function OwnerSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (username: string) => void;
  options: StaffOption[];
}) {
  return (
    <select
      className="input-base"
      name="ownerUsername"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">No owner set</option>
      {options.map((option) => (
        <option key={option.username} value={option.username}>
          {option.displayName}
        </option>
      ))}
    </select>
  );
}

export function SharedAccessPicker({
  value,
  onChange,
  options,
}: {
  value: string[];
  onChange: (usernames: string[]) => void;
  options: StaffOption[];
}) {
  const available = options.filter((option) => !value.includes(option.username));

  function labelFor(username: string) {
    return options.find((option) => option.username === username)?.displayName ?? username;
  }

  return (
    <div className="digital-chip-picker">
      <select
        className="input-base"
        value=""
        onChange={(event) => {
          const username = event.target.value;
          if (username) onChange([...value, username]);
        }}
      >
        <option value="">Add a person...</option>
        {available.map((option) => (
          <option key={option.username} value={option.username}>
            {option.displayName}
          </option>
        ))}
      </select>
      {value.length ? (
        <ul className="digital-chip-list">
          {value.map((username) => (
            <li className="digital-chip" key={username}>
              <span>{labelFor(username)}</span>
              <button
                className="digital-chip-remove"
                type="button"
                aria-label={`Remove ${labelFor(username)}`}
                onClick={() => onChange(value.filter((entry) => entry !== username))}
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <small className="digital-chip-empty">No one else has access.</small>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write the password field**

Create `app/digital-inventory/password-field.tsx`. `draft === null` means untouched — the caller uses that to decide whether to write anything at all:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { revealAccountPassword } from "./credential-actions";

const REVEAL_SECONDS = 30;

function formatStamp(value?: number) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

export default function PasswordField({
  mode,
  recordId,
  storageConfigured,
  canReveal,
  hasStoredPassword,
  passwordUpdatedAt,
  passwordUpdatedBy,
  draft,
  onDraftChange,
  onError,
}: {
  mode: "create" | "edit";
  recordId: string | null;
  storageConfigured: boolean;
  canReveal: boolean;
  hasStoredPassword: boolean;
  passwordUpdatedAt?: number;
  passwordUpdatedBy?: string;
  draft: string | null;
  onDraftChange: (value: string | null) => void;
  onError: (message: string | null) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function handleReveal() {
    if (!recordId) return;
    setIsRevealing(true);
    onError(null);

    try {
      const result = await revealAccountPassword(recordId);
      setRevealed(result.password);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setRevealed(null), REVEAL_SECONDS * 1000);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not reveal this password.");
    } finally {
      setIsRevealing(false);
    }
  }

  if (!storageConfigured) {
    return (
      <label className="digital-form-field digital-form-field-full">
        <span>Password</span>
        <input className="input-base" value="" disabled readOnly />
        <small>Credential storage not configured.</small>
      </label>
    );
  }

  const isEditingStored = mode === "edit" && draft === null;

  if (isEditingStored) {
    return (
      <div className="digital-form-field digital-form-field-full">
        <span>Password</span>
        <div className="digital-password-row">
          <code className="digital-password-value">
            {revealed ?? (hasStoredPassword ? "•".repeat(10) : "Not set")}
          </code>
          {hasStoredPassword && canReveal ? (
            <button className="btn-secondary" type="button" onClick={() => void handleReveal()} disabled={isRevealing}>
              {isRevealing ? "Revealing..." : revealed ? "Revealed" : "Reveal"}
            </button>
          ) : null}
          <button className="btn-secondary" type="button" onClick={() => onDraftChange("")}>
            {hasStoredPassword ? "Change" : "Set password"}
          </button>
        </div>
        <small>
          {hasStoredPassword && passwordUpdatedAt
            ? `Set ${formatStamp(passwordUpdatedAt)}${passwordUpdatedBy ? ` by ${passwordUpdatedBy}` : ""}. `
            : ""}
          {hasStoredPassword && !canReveal ? "Hidden — IT admin only. " : ""}
          {revealed ? `Hides again in ${REVEAL_SECONDS} seconds. ` : ""}
          Every reveal is logged.
        </small>
      </div>
    );
  }

  return (
    <div className="digital-form-field digital-form-field-full">
      <span>Password</span>
      <div className="digital-password-row">
        <input
          className="input-base"
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          value={draft ?? ""}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder="Enter the account password"
        />
        <button className="btn-secondary" type="button" onClick={() => setVisible((current) => !current)}>
          {visible ? "Hide" : "Show"}
        </button>
        {mode === "edit" ? (
          <button className="btn-secondary" type="button" onClick={() => onDraftChange(null)}>
            Cancel
          </button>
        ) : null}
      </div>
      <small>
        Stored encrypted. Leave blank to save no password.
        {mode === "edit" && hasStoredPassword ? " Saving an empty value clears the stored password." : ""}
      </small>
    </div>
  );
}
```

- [ ] **Step 3: Add the styles**

Append to `app/globals.css` after the `.digital-textarea` rule:

```css
.digital-form-section {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.digital-form-section-title {
  grid-column: 1 / -1;
  margin: 6px 0 0;
  padding-top: 10px;
  border-top: 1px solid var(--border);
  color: var(--muted-strong);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.digital-form-section:first-of-type .digital-form-section-title {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}

.digital-chip-picker {
  display: grid;
  gap: 8px;
}

.digital-chip-empty {
  color: var(--muted);
  font-size: 12px;
}

.digital-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.digital-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-muted, transparent);
  font-size: 12px;
}

.digital-chip-remove {
  border: none;
  background: none;
  padding: 0;
  color: var(--muted-strong);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}

.digital-chip-remove:hover {
  color: var(--foreground);
}

.digital-password-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.digital-password-row .input-base {
  flex: 1 1 auto;
  min-width: 0;
}

.digital-password-value {
  flex: 1 1 auto;
  min-width: 0;
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  overflow-x: auto;
  white-space: nowrap;
}
```

Then find the mobile block at `app/globals.css:17010` (`.digital-form-grid` inside a media query) and add `.digital-form-section` to that same selector list so sections collapse to one column on small screens too.

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
npm run lint
```

Expected: no errors in the two new files.

- [ ] **Step 5: Commit**

```bash
git add app/digital-inventory/staff-picker.tsx app/digital-inventory/password-field.tsx app/globals.css
git commit -m "feat: add staff picker and password field components for access accounts"
```

---

### Task 7: Rebuild the account form

**Files:**
- Modify: `app/digital-inventory/page.tsx:1-5`
- Modify: `app/digital-inventory/digital-inventory-client.tsx` — type at 34-46, default at 96-108, `accountToForm` at 220-234, handlers at 337-344, `editAccount` at 359-365, `submitAccount` at 401-425, `renderAccountForm` at 542-596, modal subtitle at 906-908

**Interfaces:**
- Consumes: `MFA_METHODS`, `MFA_METHOD_NONE` (Task 2); `listAccessAccounts` returning `hasPassword` (Task 4); `saveAccountPassword` (Task 5); `OwnerSelect`, `SharedAccessPicker`, `StaffOption`, `PasswordField` (Task 6); `useCurrentUser` (`app/current-user-context.tsx`); `isAdminRole` (`lib/roles.ts`); `api.users.list`
- Produces: the finished accounts form. Task 8 consumes the same record shape for the table.

- [ ] **Step 1: Pass the storage flag from the server component**

`page.tsx` is a server component, so it can read the secret's presence without shipping it. Replace `app/digital-inventory/page.tsx` entirely:

```tsx
import { isCredentialStorageConfigured } from "@/lib/credentialCrypto";
import DigitalInventoryClient from "./digital-inventory-client";

export default function DigitalInventoryPage() {
  return <DigitalInventoryClient credentialStorageConfigured={isCredentialStorageConfigured()} />;
}
```

- [ ] **Step 2: Update imports and the component signature**

In `digital-inventory-client.tsx`, add to the `@/lib/digitalInventory` import block:

```ts
  MFA_METHODS,
  MFA_METHOD_NONE,
```

Add these imports below the existing ones:

```ts
import { isAdminRole } from "@/lib/roles";
import { useCurrentUser } from "@/app/current-user-context";
import { saveAccountPassword } from "./credential-actions";
import PasswordField from "./password-field";
import { OwnerSelect, SharedAccessPicker, type StaffOption } from "./staff-picker";
```

Change the component signature at line 266:

```tsx
export default function DigitalInventoryClient({
  credentialStorageConfigured,
}: {
  credentialStorageConfigured: boolean;
}) {
```

- [ ] **Step 3: Replace the form state type and default**

Replace `AccessAccountFormState` (lines 34-46):

```ts
type AccessAccountFormState = {
  systemName: string;
  accountName: string;
  recoveryContact: string;
  ownerUsername: string;
  sharedWithUsernames: string[];
  mfaMethod: string;
  mfaRegisteredTo: string;
  status: string;
  lastReviewedDate: string;
  notes: string;
};
```

Replace `defaultAccountForm` (lines 96-108):

```ts
const defaultAccountForm: AccessAccountFormState = {
  systemName: "",
  accountName: "",
  recoveryContact: "",
  ownerUsername: "",
  sharedWithUsernames: [],
  mfaMethod: MFA_METHOD_NONE,
  mfaRegisteredTo: "",
  status: ACCESS_ACCOUNT_STATUSES[0],
  lastReviewedDate: "",
  notes: "",
};
```

- [ ] **Step 4: Replace `accountToForm`**

Replace lines 220-234:

```ts
function accountToForm(record: AccessAccountRecord): AccessAccountFormState {
  return {
    systemName: record.systemName,
    accountName: record.accountName,
    recoveryContact: record.recoveryContact ?? "",
    ownerUsername: record.ownerUsername ?? "",
    sharedWithUsernames: record.sharedWithUsernames ?? [],
    mfaMethod: record.mfaMethod ?? MFA_METHOD_NONE,
    mfaRegisteredTo: record.mfaRegisteredTo ?? "",
    status: record.status,
    lastReviewedDate: record.lastReviewedDate ?? "",
    notes: record.notes ?? "",
  };
}
```

`AccessAccountRecord` at line 17 is `Doc<"accessAccountsInventory">`, but the list query now returns a mapped shape with `hasPassword` and no `passwordCipher`. Replace line 17 with:

```ts
type AccessAccountRecord = Omit<Doc<"accessAccountsInventory">, "passwordCipher"> & {
  hasPassword: boolean;
};
```

- [ ] **Step 5: Add the password draft and staff list state**

Inside the component, after `const [accountForm, setAccountForm] = useState(defaultAccountForm);` (line 274):

```ts
  const [passwordDraft, setPasswordDraft] = useState<string | null>(null);

  const currentUser = useCurrentUser();
  const canRevealPasswords = isAdminRole(currentUser?.role);
  const staffOptions: StaffOption[] = (useQuery(api.users.list, {}) ?? [])
    .filter((user) => user.active)
    .map((user) => ({ username: user.username, displayName: user.displayName }));
```

`canRevealPasswords` only hides buttons. The server action in Task 5 is what actually enforces the rule.

- [ ] **Step 6: Reset the draft everywhere the form resets**

In `resetForm` (line 308), add inside the `accounts` branch:

```ts
    if (tab === "accounts") {
      setAccountForm(defaultAccountForm);
      setPasswordDraft(null);
    }
```

In `editAccount` (lines 359-365), add `setPasswordDraft(null);` before `setFormOpen(true);` so opening an existing record starts in the masked state.

- [ ] **Step 7: Replace `handleAccountMfaChange`**

Delete `handleAccountMfaChange` (lines 342-344) and replace it with a handler that clears the dependent field:

```ts
  function handleAccountMfaMethodChange(event: ChangeEvent<HTMLSelectElement>) {
    const mfaMethod = event.target.value;
    setAccountForm((current) => ({
      ...current,
      mfaMethod,
      mfaRegisteredTo: mfaMethod === MFA_METHOD_NONE ? "" : current.mfaRegisteredTo,
    }));
  }
```

- [ ] **Step 8: Rewrite `submitAccount`**

Replace lines 401-425. The record is written first, then the password, and a password failure names itself precisely so a half-saved record is never mistaken for a complete one:

```ts
  async function submitAccount() {
    const payload = {
      systemName: accountForm.systemName,
      accountName: accountForm.accountName,
      recoveryContact: optionalText(accountForm.recoveryContact),
      ownerUsername: optionalText(accountForm.ownerUsername),
      sharedWithUsernames: accountForm.sharedWithUsernames,
      mfaMethod: accountForm.mfaMethod,
      mfaRegisteredTo: optionalText(accountForm.mfaRegisteredTo),
      lastReviewedDate: optionalText(accountForm.lastReviewedDate),
      status: accountForm.status,
      notes: optionalText(accountForm.notes),
    };

    let recordId: string;
    if (editingId) {
      await updateAccessAccount({
        recordId: editingId as Id<"accessAccountsInventory">,
        ...payload,
      });
      recordId = editingId;
    } else {
      recordId = await createAccessAccount(payload);
    }

    if (passwordDraft === null) return;

    try {
      await saveAccountPassword(recordId, passwordDraft);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error.";
      throw new Error(
        `${editingId ? "Record saved" : "Record created"}, but the password could not be stored. ${reason}`,
      );
    }
  }
```

- [ ] **Step 9: Rewrite `renderAccountForm`**

Replace lines 542-596:

```tsx
  function renderAccountForm() {
    const editingRecord = editingId
      ? allAccessAccounts.find((record) => record._id === editingId)
      : undefined;

    return (
      <>
        <section className="digital-form-section">
          <h3 className="digital-form-section-title">Identity</h3>
          <label className="digital-form-field">
            <span>System / Platform</span>
            <input className="input-base" name="systemName" value={accountForm.systemName} onChange={handleAccountChange} required placeholder="Microsoft 365, Canva, PLDT portal" />
          </label>
          <label className="digital-form-field">
            <span>Email / Username</span>
            <input className="input-base" name="accountName" value={accountForm.accountName} onChange={handleAccountChange} required />
          </label>
        </section>

        <section className="digital-form-section">
          <h3 className="digital-form-section-title">Credential</h3>
          <PasswordField
            mode={editingId ? "edit" : "create"}
            recordId={editingId}
            storageConfigured={credentialStorageConfigured}
            canReveal={canRevealPasswords}
            hasStoredPassword={Boolean(editingRecord?.hasPassword)}
            passwordUpdatedAt={editingRecord?.passwordUpdatedAt}
            passwordUpdatedBy={editingRecord?.passwordUpdatedBy}
            draft={passwordDraft}
            onDraftChange={setPasswordDraft}
            onError={setErrorMessage}
          />
          <label className="digital-form-field digital-form-field-full">
            <span>Recovery Email / Phone</span>
            <input className="input-base" name="recoveryContact" value={accountForm.recoveryContact} onChange={handleAccountChange} placeholder="Where reset codes are sent" />
          </label>
        </section>

        <section className="digital-form-section">
          <h3 className="digital-form-section-title">Ownership</h3>
          <label className="digital-form-field">
            <span>Owner / Admin</span>
            <OwnerSelect
              value={accountForm.ownerUsername}
              onChange={(username) => setAccountForm((current) => ({ ...current, ownerUsername: username }))}
              options={staffOptions}
            />
          </label>
          <div className="digital-form-field">
            <span>Who Else Has Access</span>
            <SharedAccessPicker
              value={accountForm.sharedWithUsernames}
              onChange={(usernames) => setAccountForm((current) => ({ ...current, sharedWithUsernames: usernames }))}
              options={staffOptions}
            />
          </div>
        </section>

        <section className="digital-form-section">
          <h3 className="digital-form-section-title">Security</h3>
          <label className="digital-form-field">
            <span>MFA</span>
            <select className="input-base" name="mfaMethod" value={accountForm.mfaMethod} onChange={handleAccountMfaMethodChange}>
              {MFA_METHODS.map((method) => (
                <option key={method} value={method}>{method}</option>
              ))}
            </select>
          </label>
          <label className="digital-form-field">
            <span>MFA Registered To</span>
            <input
              className="input-base"
              name="mfaRegisteredTo"
              value={accountForm.mfaRegisteredTo}
              onChange={handleAccountChange}
              disabled={accountForm.mfaMethod === MFA_METHOD_NONE}
              placeholder="Phone or device holding the second factor"
            />
          </label>
        </section>

        <section className="digital-form-section">
          <h3 className="digital-form-section-title">Record</h3>
          <label className="digital-form-field">
            <span>Status</span>
            <select className="input-base" name="status" value={accountForm.status} onChange={handleAccountChange}>
              {ACCESS_ACCOUNT_STATUSES.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </label>
          <label className="digital-form-field">
            <span>Last Reviewed</span>
            <input className="input-base" name="lastReviewedDate" type="date" value={accountForm.lastReviewedDate} onChange={handleAccountChange} />
          </label>
          <label className="digital-form-field digital-form-field-full">
            <span>Notes</span>
            <textarea className="input-base digital-textarea" name="notes" value={accountForm.notes} onChange={handleAccountChange} />
          </label>
        </section>
      </>
    );
  }
```

- [ ] **Step 10: Update the modal subtitle**

Replace the accounts branch at lines 906-908:

```tsx
                    {activeTab === "accounts"
                      ? "Passwords are encrypted. Only IT admins can reveal them, and every reveal is logged."
                      : "Fill in the useful fields now. Optional fields can be completed later."}
```

- [ ] **Step 11: Verify**

```bash
npx tsc --noEmit
npm run lint
```

Expected: no errors. The table still references `record.ownerName` and `record.accessLevel` — if `tsc` flags `renderAccountsTable`, that is expected and Task 8 fixes it.

- [ ] **Step 12: Commit**

```bash
git add app/digital-inventory/page.tsx app/digital-inventory/digital-inventory-client.tsx
git commit -m "feat: rebuild access accounts form around 11 fields with encrypted password"
```

---

### Task 8: Update the accounts table and verify end to end

**Files:**
- Modify: `app/digital-inventory/digital-inventory-client.tsx:717-757` (`renderAccountsTable`)

**Interfaces:**
- Consumes: everything from Tasks 1-7
- Produces: the finished feature

- [ ] **Step 1: Rewrite `renderAccountsTable`**

Replace lines 717-757. Add a `staffLabel` helper directly above it so usernames render as display names:

```tsx
  function staffLabel(username?: string) {
    if (!username) return "-";
    return staffOptions.find((option) => option.username === username)?.displayName ?? username;
  }

  function renderAccountsTable() {
    return (
      <table className="saas-table digital-table">
        <thead>
          <tr>
            <th>System</th>
            <th>Email / Username</th>
            <th>Owner</th>
            <th>Shared With</th>
            <th>MFA</th>
            <th>Reviewed</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {accessAccounts.map((record) => (
            <tr key={record._id}>
              <td>
                <strong>{record.systemName}</strong>
                <span>{record.hasPassword ? "Password on file" : "No password saved"}</span>
              </td>
              <td>{record.accountName}</td>
              <td>{staffLabel(record.ownerUsername)}</td>
              <td>
                {record.sharedWithUsernames?.length
                  ? `${record.sharedWithUsernames.length} ${record.sharedWithUsernames.length === 1 ? "person" : "people"}`
                  : "-"}
              </td>
              <td>{record.mfaEnabled ? record.mfaMethod || "Yes" : "No"}</td>
              <td>{formatDate(record.lastReviewedDate)}</td>
              <td><span className={getStatusClass(record.status)}>{record.status}</span></td>
              <td>
                <div className="digital-row-actions">
                  <button className="btn-secondary" type="button" onClick={() => editAccount(record)}>Edit</button>
                  <button className="btn-danger" type="button" onClick={() => void handleRemoveAccount(record)}>Delete</button>
                </div>
              </td>
            </tr>
          ))}
          {!accessAccounts.length ? <EmptyState label="Access & Accounts" /> : null}
        </tbody>
      </table>
    );
  }
```

No password column. The delete confirmation at line 478 still reads `record.accountName`, which is now the email/username — that is correct and needs no change.

- [ ] **Step 2: Verify the build**

```bash
npx tsc --noEmit
npm run lint
npm test
```

Expected: all three clean.

- [ ] **Step 3: Manual verification**

Run `npm run dev` and `npx convex dev` in separate terminals, sign in as an admin, and open Digital Inventory → Access & Accounts. Confirm each of these:

1. Add Record shows exactly 11 fields in five sections; no Account Type, Department, Access Level, or Vault Reference anywhere.
2. Owner/Admin and Who Else Has Access list real staff names. Adding someone to Who Else creates a removable chip.
3. MFA Registered To is disabled while MFA is `None`, and enables when a method is chosen.
4. Saving a new record with a password succeeds; the table row reads "Password on file".
5. Reopening that record shows `••••••••` with `Set <date> by <you>`, plus Reveal and Change.
6. Reveal shows the exact password typed, then re-masks after 30 seconds.
7. Editing and saving *without* touching the password leaves the password intact — reveal again to confirm.
8. Change → new value → Save, then reveal shows the new value.
9. Change → clear the box → Save, and the row reads "No password saved".
10. In the Convex dashboard, `credentialAccessLog` has `update`, `reveal`, and `clear` rows with your username.
11. In the Convex dashboard, `accessAccountsInventory.passwordCipher` is unreadable ciphertext beginning `v1.`.
12. Search finds a record by system, username, owner, and MFA method — and finds nothing when searching the password text.
13. Sign in as a non-admin (role `member`): the Reveal button is absent.
14. Stop the dev server, remove `IT_CREDENTIAL_SECRET` from `.env.local`, restart, and confirm the Password field is disabled reading "Credential storage not configured." Restore the secret afterwards.

- [ ] **Step 4: Commit**

```bash
git add app/digital-inventory/digital-inventory-client.tsx
git commit -m "feat: update access accounts table for new fields"
```

---

## Notes for the implementer

- **Do not add a Convex-side role check.** Convex has no auth context in this app; a check there reads as security but enforces nothing. The gate lives in `credential-actions.ts`.
- **Do not put `IT_CREDENTIAL_SECRET` behind a `NEXT_PUBLIC_` name.** That ships the key to the browser and defeats the entire task.
- **Rotating `IT_CREDENTIAL_SECRET` makes every stored password undecryptable.** There is no re-encryption path in this plan. Reveal will report the key-changed message and passwords must be re-entered.
- The Convex mutations remain callable without auth, so someone with the deployment URL could write junk into a record. They cannot read a password without the server-side key. Authenticating Convex calls generally is out of scope, per the spec.
