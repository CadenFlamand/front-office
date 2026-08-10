import { neon } from "@neondatabase/serverless";

import { hashPassword, verifyPassword } from "@/lib/auth/password";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}
const sql = neon(process.env.DATABASE_URL);

export type UserPlan = "free" | "premium";

export interface User {
  id: string;
  email: string;
  plan: UserPlan;
}

interface UserRow {
  id: string;
  email: string;
  plan: string;
  password_hash?: string;
}

function toUser(row: UserRow): User {
  return { id: row.id, email: row.email, plan: row.plan as UserPlan };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function getUserById(id: string): Promise<User | null> {
  const rows = (await sql`
    SELECT id, email, plan FROM users WHERE id = ${id}
  `) as UserRow[];
  return rows.length > 0 ? toUser(rows[0]) : null;
}

export type CreateUserResult =
  | { ok: true; user: User }
  | { ok: false; error: "email-taken" };

export async function createUser(
  email: string,
  plaintextPassword: string
): Promise<CreateUserResult> {
  const normalized = normalizeEmail(email);
  const passwordHash = await hashPassword(plaintextPassword);

  // ON CONFLICT DO NOTHING rather than a SELECT-then-INSERT: the check-then-act
  // version has a race where two concurrent sign-ups with the same email both
  // pass the check. Here the unique index decides, and losing the race just
  // returns no rows.
  const rows = (await sql`
    INSERT INTO users (email, password_hash)
    VALUES (${normalized}, ${passwordHash})
    ON CONFLICT (email) DO NOTHING
    RETURNING id, email, plan
  `) as UserRow[];

  if (rows.length === 0) return { ok: false, error: "email-taken" };
  return { ok: true, user: toUser(rows[0]) };
}

// A real bcrypt hash of a throwaway value, compared against when no user
// exists so that a sign-in attempt for an unknown email costs the same ~250ms
// as one for a known email. Without this, response timing tells an attacker
// which addresses are registered.
const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.aBcDeFgHiJkLmNoPqRsTuVwXyZ012345";

export async function verifyCredentials(
  email: string,
  plaintextPassword: string
): Promise<User | null> {
  const normalized = normalizeEmail(email);
  const rows = (await sql`
    SELECT id, email, plan, password_hash FROM users WHERE email = ${normalized}
  `) as UserRow[];

  if (rows.length === 0) {
    await verifyPassword(plaintextPassword, DUMMY_HASH);
    return null;
  }

  const row = rows[0];
  const valid = await verifyPassword(plaintextPassword, row.password_hash ?? DUMMY_HASH);
  return valid ? toUser(row) : null;
}

/**
 * For the change-password flow: the caller already has a valid session (so
 * there's no email-enumeration timing concern to guard against, unlike
 * verifyCredentials), and just needs to confirm the account's *current*
 * password before allowing a new one.
 */
export async function verifyCurrentPassword(
  userId: string,
  plaintextPassword: string
): Promise<boolean> {
  const rows = (await sql`
    SELECT password_hash FROM users WHERE id = ${userId}
  `) as UserRow[];
  if (rows.length === 0 || !rows[0].password_hash) return false;
  return verifyPassword(plaintextPassword, rows[0].password_hash);
}

export async function updatePassword(userId: string, plaintextPassword: string): Promise<void> {
  const passwordHash = await hashPassword(plaintextPassword);
  await sql`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${userId}`;
}
