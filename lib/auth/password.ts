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
