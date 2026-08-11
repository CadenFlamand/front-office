import bcrypt from "bcryptjs";

// bcryptjs (pure JS, zero deps) rather than the native `bcrypt` binding —
// no node-gyp build step, which matters on Vercel's serverless runtime.
//
// Cost 12: ~250ms per hash on typical serverless hardware. Deliberately slow
// — that cost is the whole point of a password hash, and it's only paid on
// sign-up and sign-in, never on a normal page render.
const BCRYPT_COST = 12;

// Deliberately no `import "server-only"` here, unlike the session/DAL code
// this sits alongside. These are pure string functions with no request
// context, no env vars and no database handle, and the backfill/admin
// scripts (run through tsx, outside Next) need to import them — `server-only`
// throws outside a React Server Component graph, which would break that.
// The modules that read cookies or hold a DB connection are the ones that
// carry the guard.

// Low enough not to annoy, high enough to rule out trivially guessable
// passwords. Deliberately no composition rules (symbols/digits/case), which
// research consistently finds push users toward predictable patterns.
const MIN_PASSWORD_LENGTH = 8;

// Shared by every path that sets a password to a *new* value — sign-up,
// change-password, and reset-password (lib/auth/actions.ts) — so the one
// rule lives in one place. Lives here rather than in actions.ts itself
// because every export of a "use server" file must be an async server
// action; this is a plain sync validator, not one.
export function validateNewPassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

export function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_COST);
}

/**
 * Constant-time-ish comparison via bcrypt's own compare. Always run this
 * against a real hash even when the user doesn't exist (see lib/db/users.ts's
 * verifyCredentials) so sign-in timing doesn't reveal which emails are
 * registered.
 */
export function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}
