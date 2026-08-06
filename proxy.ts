import { NextResponse, type NextRequest } from "next/server";

import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  SESSION_REFRESH_AFTER_SECONDS,
  decryptSession,
  encryptSession,
} from "@/lib/auth/session";

/**
 * Sliding-session refresh, and nothing else.
 *
 * This file is `proxy.ts`, not `middleware.ts` — Next 16 renamed the
 * convention (middleware is deprecated) and defaults it to the Node.js
 * runtime.
 *
 * It exists only because Next does not allow setting cookies during Server
 * Component rendering, so a session read on a normal page navigation has no
 * way to extend itself. Proxy can set cookies, and this does the one thing
 * Next's guide says is appropriate here: a pure cookie/JWT operation with no
 * database access on the request path.
 *
 * Authorization deliberately does NOT live here. Proxy runs on every matched
 * request including prefetches, and the real checks need database state
 * (does this account still exist, does it hold this league) — those stay in
 * lib/auth/dal.ts, which is the only thing pages and actions trust.
 */
export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return NextResponse.next();

  const payload = await decryptSession(token);
  if (!payload) {
    // Expired or tampered with: clear it so the browser stops sending a dead
    // cookie on every subsequent request.
    const response = NextResponse.next();
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }

  const ageSeconds = Math.floor(Date.now() / 1000) - payload.issuedAt;
  if (ageSeconds < SESSION_REFRESH_AFTER_SECONDS) return NextResponse.next();

  // Re-mint rather than just extending the cookie's expiry. The JWT carries
  // its own `exp`, so pushing out only the cookie would leave a token that
  // still fails verification on its original schedule — the session would die
  // at 30 days regardless of activity, which is the bug this refresh exists
  // to avoid.
  const refreshed = await encryptSession(payload.userId);
  const response = NextResponse.next();
  response.cookies.set(SESSION_COOKIE_NAME, refreshed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
    path: "/",
  });
  return response;
}

export const config = {
  // Without a matcher, proxy runs on static assets and image optimization
  // too. Excluding them keeps this off the hot path for every CSS/JS/font
  // request, where it would do nothing useful.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|mov|mp4|webm)$).*)"],
};
