# Access & Accounts Form Redesign

Date: 2026-08-11
Scope: the Access & Accounts tab of Digital Inventory (`app/digital-inventory/`)

## Goal

Rework which fields the Access & Accounts form captures, and add encrypted
password storage with an admin-only reveal.

The form today records access *metadata* and explicitly refuses to hold
credentials. The new form holds the credential itself, encrypted, so IT no
longer keeps platform logins in a separate spreadsheet.

## Field changes

Target field list, in form order:

| Field | Source | Type |
|-------|--------|------|
| System/Platform | existing `systemName`, relabelled | text, required |
| Email/Username | existing `accountName`, relabelled | text, required |
| Password | new `passwordCipher` | encrypted, admin reveal |
| Recovery Email/Phone | new `recoveryContact` | text |
| Owner/Admin | `ownerName` renamed to `ownerUsername` | single-select |
| Who Else Has Access | new `sharedWithUsernames` | multi-select |
| MFA | new `mfaMethod` | select |
| MFA Registered To | new `mfaRegisteredTo` | text |
| Status | existing `status` | select |
| Last Reviewed | existing `lastReviewedDate` | date |
| Notes | existing `notes` | textarea |

Removed from the form: `accountType`, `department`, `accessLevel`,
`vaultReference`.

Removed fields are dropped from the Convex schema and the create/update
mutations. Any values already stored in them are lost. This is intentional —
`vaultReference` is superseded by `passwordCipher`, and the other three were
free-text fields with no consumer outside this one table. If existing rows
carry data worth keeping, export before deploying the schema change.

MFA is a single control, not a checkbox plus a method select. `MFA_METHODS`:
`None`, `Authenticator App`, `SMS`, `Email`, `Hardware Key`, `Backup Codes`.
`None` is the default and means MFA is off. Added to `lib/digitalInventory.ts`
alongside the existing status lists, with an `isMfaMethod` guard matching the
existing pattern.

`mfaMethod` is the single source of truth. The existing `mfaEnabled` boolean
stays in the schema but is derived server-side on every write
(`mfaEnabled = mfaMethod !== "None"`), so the table view and any existing
consumers keep working without a boolean-to-string refactor. It is never set
directly from the form.

## Schema

```ts
accessAccountsInventory: defineTable({
  systemName: v.string(),
  accountName: v.string(),
  ownerUsername: v.optional(v.string()),
  sharedWithUsernames: v.optional(v.array(v.string())),
  recoveryContact: v.optional(v.string()),
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
```

Indexes are unchanged: `by_status`, `by_lastReviewedDate`, `by_updatedAt`.

`ownerName` becomes `ownerUsername` because the value is now a `users.username`
rather than typed text. Usernames are stored (not `Id<"users">`) to match the
existing convention in `departments`, where leadership is stored as usernames so
the reference survives display-name changes.

Reveal audit rows go in a new table:

```ts
credentialAccessLog: defineTable({
  recordId: v.id("accessAccountsInventory"),
  actorUsername: v.string(),
  action: v.string(),        // "reveal" | "update" | "clear"
  at: v.number(),
}).index("by_recordId", ["recordId"])
```

## Form UX

Fields group into four labelled sections — Identity, Credential, Ownership,
Security — plus the existing Record fields. The Office Software and
Subscriptions tabs keep their current flat grid; only the accounts form gains
sections.

**Password on create:** a normal input with a show/hide toggle. The value is
being typed, so nothing needs decrypting.

**Password on edit:** renders as `•••••••• Set <date> by <username>` with
**Reveal** and **Change** buttons. Reveal calls the server action, displays the
value for 30 seconds, then re-masks. Non-admins see `Hidden — IT admin only`
and no Reveal button.

Leaving the password untouched on edit does not overwrite it. Only pressing
Change and saving a new value re-encrypts. Saving an empty value through Change
clears the stored credential.

**MFA Registered To is disabled while MFA is `None`**, and clears when MFA is
set back to `None`, so no account carries an MFA contact without MFA. The
server enforces this too — it does not rely on the disabled state.

**Owner/Admin and Who Else Has Access** are both pickers over active users from
the `users` table. Owner is single-select; Who Else is multi-select chips. Owner
is converted from free text for consistency: mixing a picker and a text box for
the same kind of value is confusing.

The modal subtitle changes from "Track access details only. Do not save
passwords or secret keys here." to "Passwords are encrypted. Only IT admins can
reveal them, and every reveal is logged."

**Table columns:** System · Email/Username · Owner · Shared with (count) ·
MFA (method) · Reviewed · Status · Actions. No password column — the credential
is never rendered in a list.

## Credential handling

### Why a server action

Auth in this app is an HMAC-signed cookie verified in Next.js
(`lib/auth.ts:144`). Convex functions have no auth context — the browser calls
them directly. A role check written inside a Convex query is therefore
cosmetic, and the encryption key cannot live anywhere the client can reach.

Both the encrypted write and the reveal go through Next.js server actions,
following the `ConvexHttpClient` pattern already in `app/login/actions.ts:42`.

### Encryption

New `lib/credentialCrypto.ts`, in the Web Crypto style of `lib/auth.ts:54`:

- AES-256-GCM, key derived from a new `IT_CREDENTIAL_SECRET` env var
- Fresh random 12-byte IV per encryption
- Stored as `v1.<iv base64url>.<ciphertext base64url>` — the version prefix
  makes a future key rotation detectable instead of silently corrupting

If `IT_CREDENTIAL_SECRET` is unset, the Password field renders disabled with
"Credential storage not configured." It must never fall back to storing
plaintext.

### Server actions

`app/digital-inventory/credential-actions.ts`. Both actions gate identically:
read cookie → `verifySessionToken` → `isAdminRole(session.role)` → proceed,
else throw.

- `saveAccountPassword(recordId, plaintext)` — encrypts, writes cipher plus
  `passwordUpdatedAt`/`passwordUpdatedBy` via `ConvexHttpClient`, logs `update`.
  An empty string clears the credential and logs `clear`.
- `revealAccountPassword(recordId)` — fetches the cipher, decrypts, **writes
  the `reveal` log before returning**, then returns the plaintext. Decrypt
  failure surfaces "Could not decrypt — the encryption key may have changed"
  rather than a raw crypto error.

Two supporting Convex functions are needed: a `setAccountPassword` mutation and
a query returning a single record's cipher. Both are called only from the
server actions.

### Create flow

Creating a record with a password is two steps: the record is created through
the existing Convex mutation, then the password is saved by server action
against the returned ID. If step two fails, the error reads "Record saved, but
the password could not be stored." The record is not left looking complete when
it is not.

### Accepted limit

The Convex mutations remain unauthenticated, so someone holding the deployment
URL could write junk into a record. They cannot read any password without the
server-side key. Putting a signed session token on every Convex call is the
larger fix and is deliberately out of scope here.

## Validation and errors

- `systemName` and `accountName` stay required
- `mfaMethod` is validated against `MFA_METHODS`; `mfaRegisteredTo` is cleared
  and `mfaEnabled` set to false server-side when `mfaMethod` is `None`
- `sharedWithUsernames` is filtered against active users on write, so a deleted
  user does not linger on a record
- Server action errors surface in the existing `digital-alert` band; a failed
  reveal leaves the modal open

## Testing

The repo has no test framework — `npm run lint` is the only script. Form and
schema work verifies by `npm run lint`, `npx tsc --noEmit`, and manual run.

One exception: add `node:test` (built into Node, no new dependency) covering
`lib/credentialCrypto.ts` — encrypt/decrypt round-trip, tampered-ciphertext
rejection, and missing-key behaviour. Silently broken crypto is the one failure
here that clicking through the UI would not catch.

## Out of scope

- Authenticating Convex calls generally
- Duplicate detection on system + account
- Overdue-review warnings
- Backfilling or migrating the four removed fields
