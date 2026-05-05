import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const USER_ROLES = ["admin", "it_staff", "approver", "requester"] as const;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_HASH_ITERATIONS = 120_000;
const PASSWORD_HASH_ALGORITHM = "pbkdf2-sha256";
const encoder = new TextEncoder();

type UserRole = (typeof USER_ROLES)[number];

function normalizeRequired(value: string, label: string) {
  const next = value.trim();
  if (!next) {
    throw new Error(`${label} is required.`);
  }
  return next;
}

function normalizeOptional(value?: string) {
  const next = value?.trim();
  return next ? next : undefined;
}

function normalizeUsername(value: string) {
  const username = normalizeRequired(value, "Username").toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    throw new Error("Username must be 3-40 characters and use only letters, numbers, dots, underscores, or dashes.");
  }
  return username;
}

function normalizeEmail(value?: string) {
  const email = normalizeOptional(value)?.toLowerCase();
  if (!email) return undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Email address is not valid.");
  }
  return email;
}

function ensureRole(value: string): UserRole {
  if ((USER_ROLES as readonly string[]).includes(value)) {
    return value as UserRole;
  }
  throw new Error("Invalid user role.");
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(value: string) {
  if (value.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(value)) {
    return null;
  }

  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function validatePassword(password: string) {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
}

async function hashPassword(password: string) {
  validatePassword(password);

  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PASSWORD_HASH_ITERATIONS,
      hash: "SHA-256",
    },
    key,
    256,
  );

  return [
    PASSWORD_HASH_ALGORITHM,
    String(PASSWORD_HASH_ITERATIONS),
    toHex(salt),
    toHex(new Uint8Array(derivedBits)),
  ].join(":");
}

async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, iterationsRaw, saltHex, hashHex] = storedHash.split(":");
  const iterations = Number(iterationsRaw);
  const salt = saltHex ? fromHex(saltHex) : null;

  if (algorithm !== PASSWORD_HASH_ALGORITHM || !Number.isFinite(iterations) || !salt || !hashHex) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    key,
    256,
  );

  return timingSafeEqual(toHex(new Uint8Array(derivedBits)), hashHex);
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("users").collect();
    return rows
      .sort((left, right) => {
        if (left.active !== right.active) return left.active ? -1 : 1;
        return left.displayName.localeCompare(right.displayName);
      })
      .map((row) => ({
        _id: row._id,
        _creationTime: row._creationTime,
        displayName: row.displayName,
        username: row.username,
        email: row.email,
        role: row.role,
        department: row.department,
        section: row.section,
        active: row.active,
        passwordConfigured: Boolean(row.passwordHash),
        passwordUpdatedAt: row.passwordUpdatedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        createdBy: row.createdBy,
      }));
  },
});

export const authenticate = mutation({
  args: {
    username: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const username = args.username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();

    if (!user || !user.active || !user.passwordHash) {
      return null;
    }

    const passwordMatches = await verifyPassword(args.password, user.passwordHash);
    if (!passwordMatches) {
      return null;
    }

    return {
      userId: user._id,
      displayName: user.displayName,
      username: user.username,
      email: user.email,
      role: user.role,
      department: user.department,
      section: user.section,
    };
  },
});

export const create = mutation({
  args: {
    displayName: v.string(),
    username: v.string(),
    email: v.optional(v.string()),
    role: v.string(),
    department: v.optional(v.string()),
    section: v.optional(v.string()),
    temporaryPassword: v.optional(v.string()),
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const displayName = normalizeRequired(args.displayName, "Full name");
    const username = normalizeUsername(args.username);
    const email = normalizeEmail(args.email);
    const role = ensureRole(args.role);
    const department = normalizeOptional(args.department);
    const section = normalizeOptional(args.section);
    const createdBy = normalizeOptional(args.createdBy);
    const passwordHash = args.temporaryPassword
      ? await hashPassword(args.temporaryPassword)
      : undefined;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (existing) {
      throw new Error("Username is already used by another account.");
    }

    const now = Date.now();
    return await ctx.db.insert("users", {
      displayName,
      username,
      email,
      role,
      department,
      section,
      active: true,
      passwordHash,
      passwordUpdatedAt: passwordHash ? now : undefined,
      createdAt: now,
      updatedAt: now,
      createdBy,
    });
  },
});

export const setPassword = mutation({
  args: {
    userId: v.id("users"),
    temporaryPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User account could not be found.");
    }

    const now = Date.now();
    await ctx.db.patch(user._id, {
      passwordHash: await hashPassword(args.temporaryPassword),
      passwordUpdatedAt: now,
      updatedAt: now,
    });

    return { success: true };
  },
});

export const updateRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User account could not be found.");
    }

    await ctx.db.patch(user._id, {
      role: ensureRole(args.role),
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const setActive = mutation({
  args: {
    userId: v.id("users"),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User account could not be found.");
    }

    await ctx.db.patch(user._id, {
      active: args.active,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});
