import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { getUserById, normalizeEmail, type User } from "@/lib/db/users";
import { userHasLeague } from "@/lib/db/user-leagues";
import { isManualLeagueId } from "@/lib/manual-league";

import { decryptSession, readSessionCookie } from "./session";

/**
 * The data access layer Next 16's authentication guide recommends: the single
 * place that turns a session cookie into a real, database-backed user, so
 * authorization never depends on whatever a cookie happens to claim.
 *
 * Wrapped in React's cache() so several components and actions in one render
 * pass share a single lookup instead of each hitting the database.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const payload = await decryptSession(await readSessionCookie());
  if (!payload) return null;
  // Deliberately re-read the user rather than trusting the cookie's contents:
  // a deleted account, or a plan downgrade, has to take effect immediately
  // rather than lingering until a 30-day-old token expires.
  return getUserById(payload.userId);
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  return user;
}

/**
 * Gate for manual leagues, which hold private user-entered data and are
 * owner-only for both reading and writing.
 *
 * Sleeper leagues are deliberately *not* gated: the app is a lens over public
 * Sleeper API data, so restricting the view would lock out the eleven other
 * managers in a shared league without protecting anything that isn't already
 * public.
 */
export async function requireManualLeagueAccess(leagueId: string): Promise<User> {
  const user = await requireUser();
  if (!isManualLeagueId(leagueId)) return user;
  if (!(await userHasLeague(user.id, leagueId))) {
    // notFound() rather than a 403: revealing that a manual league exists but
    // belongs to someone else is itself a small leak, and there's nothing
    // useful a non-owner can do with the distinction.
    const { notFound } = await import("next/navigation");
    notFound();
  }
  return user;
}

/**
 * Non-redirecting variant for server actions, which should return a typed
 * failure the client can render rather than throwing a redirect mid-mutation.
 */
export async function getAuthorizedManualLeagueUser(leagueId: string): Promise<User | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!isManualLeagueId(leagueId)) return user;
  return (await userHasLeague(user.id, leagueId)) ? user : null;
}

/**
 * Gate for the one admin-only surface (GM Insight authoring) — identified by
 * email against ADMIN_EMAIL rather than a role column, since there's exactly
 * one admin (Caden) and no plan to ever have more. requireUser() first, so
 * an anonymous visitor is sent to sign in; a signed-in non-admin gets
 * notFound() rather than a 403, matching requireManualLeagueAccess's reasoning
 * — no reason to confirm the surface exists at all to someone it isn't for.
 */
export async function requireAdminAccess(): Promise<User> {
  const user = await requireUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    throw new Error("ADMIN_EMAIL is not set");
  }
  if (user.email !== normalizeEmail(adminEmail)) {
    const { notFound } = await import("next/navigation");
    notFound();
  }
  return user;
}
