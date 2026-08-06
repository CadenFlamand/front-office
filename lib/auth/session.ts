import "server-only";

import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

// This module holds the signing key and is the only place session cookies are
// minted or read. `server-only` makes importing it from a client component a
// build error rather than a runtime surprise — the same class of mistake that
// leaked a database client into the browser bundle earlier (see
// lib/team-advice-format.ts). Unlike lib/auth/password.ts, nothing outside a
// request context ever needs this, so the guard costs nothing here.

const SESSION_COOKIE = "front-office-session";

// 30-day sliding window: the token is minted with a 30-day lifetime and
// re-minted by proxy.ts whenever it's more than a day old, so an active user
// never gets logged out while someone who stops visiting expires 30 days
// after their last visit.
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const SESSION_REFRESH_AFTER_SECONDS = 24 * 60 * 60;

function getKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // Fail loudly rather than silently signing with an empty key, which would
    // make every session forgeable.
    throw new Error("SESSION_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  // Seconds since epoch, from the JWT's own `iat` — used by proxy.ts to
  // decide whether this token is stale enough to re-mint.
  issuedAt: number;
}

/**
 * Payload is deliberately just the user ID: no email, no plan, nothing
 * personally identifying. Anything else would be a copy of database state
 * that could silently go stale inside a cookie the server can't revoke —
 * plan in particular, since a stale "premium" would hand out free quota.
 * Everything else is looked up per-request in the DAL.
 */
export async function encryptSession(userId: string): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getKey());
}

export async function decryptSession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getKey(), { algorithms: ["HS256"] });
    const userId = payload.userId;
    if (typeof userId !== "string" || typeof payload.iat !== "number") return null;
    return { userId, issuedAt: payload.iat };
  } catch {
    // Expired, tampered with, or signed by a different secret — all
    // indistinguishable to a caller, and all mean "no session".
    return null;
  }
}

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    // Off on plain-HTTP localhost, or the browser drops the cookie and
    // sign-in silently fails in dev.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    expires,
    path: "/",
  };
}

/**
 * Only callable from a Server Action or Route Handler — Next 16 does not
 * support setting cookies during Server Component rendering.
 */
export async function createSession(userId: string): Promise<void> {
  const token = await encryptSession(userId);
  const cookieStore = await cookies();
  cookieStore.set(
    SESSION_COOKIE,
    token,
    cookieOptions(new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000))
  );
}

export async function readSessionCookie(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
