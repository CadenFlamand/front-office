import { createHash, randomBytes } from "node:crypto";

import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}
const sql = neon(process.env.DATABASE_URL);

// 1 hour, per the feature spec — short enough that a stale email sitting in
// an inbox isn't a standing risk, long enough that a real user doesn't race
// their own mail client.
const TOKEN_TTL_MS = 60 * 60 * 1000;

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Creates a new reset request and returns the raw token to embed in the
 * emailed link — the one and only place the raw value exists outside the
 * user's inbox. Only token_hash (sha256 of this) is ever persisted; see
 * schema.sql's comment on password_reset_tokens for why a fast hash rather
 * than bcrypt is the right choice here.
 *
 * Never invalidates a prior pending token for the same user — a second
 * "forgot password" click shouldn't silently dead-end whichever email they
 * open first, and redeemResetToken()'s single-use marking means only one of
 * several outstanding tokens can ever actually be spent.
 */
export async function createResetToken(userId: string): Promise<string> {
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await sql`
    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
    VALUES (${userId}, ${tokenHash}, ${expiresAt.toISOString()})
  `;

  return rawToken;
}

/**
 * Atomically claims a reset token: valid (exists, unused, unexpired) tokens
 * get marked used and hand back the owning user_id in the same statement, so
 * two concurrent redemption attempts against the same token can't both
 * succeed — the second one simply finds used_at already set and matches zero
 * rows. Same race-free shape as lib/db/users.ts's createUser().
 *
 * Returns null for "invalid, expired, or already used" without
 * distinguishing which — same anti-enumeration instinct as sign-in's merged
 * error message.
 */
export async function redeemResetToken(rawToken: string): Promise<string | null> {
  const tokenHash = hashToken(rawToken);

  const rows = (await sql`
    UPDATE password_reset_tokens
    SET used_at = now()
    WHERE token_hash = ${tokenHash} AND used_at IS NULL AND expires_at > now()
    RETURNING user_id
  `) as { user_id: string }[];

  return rows.length > 0 ? rows[0].user_id : null;
}
