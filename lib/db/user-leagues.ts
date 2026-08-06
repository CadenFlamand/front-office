import { neon } from "@neondatabase/serverless";

import type { UserPlan } from "./users";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}
const sql = neon(process.env.DATABASE_URL);

// A free account may hold one league, of either kind. Enforced when a league
// is *added*, never as a standing invariant — an account that is already over
// the limit (the backfilled first account holds three) keeps working rather
// than being retroactively locked out.
export const FREE_LEAGUE_LIMIT = 1;

export interface UserLeague {
  leagueId: string;
  createdAt: Date;
}

export async function listUserLeagues(userId: string): Promise<UserLeague[]> {
  const rows = await sql`
    SELECT league_id, created_at FROM user_leagues
    WHERE user_id = ${userId}
    ORDER BY created_at
  `;
  return rows.map((row) => ({
    leagueId: row.league_id as string,
    createdAt: new Date(row.created_at as string),
  }));
}

export async function countUserLeagues(userId: string): Promise<number> {
  const rows = await sql`SELECT count(*) AS n FROM user_leagues WHERE user_id = ${userId}`;
  return Number(rows[0].n);
}

/**
 * Whether this specific user has added this league. Note this is *not* a
 * question about the league itself: any number of users may hold the same
 * Sleeper league (twelve leaguemates each adding their shared league is the
 * expected case), so this only ever answers for one user.
 */
export async function userHasLeague(userId: string, leagueId: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM user_leagues WHERE user_id = ${userId} AND league_id = ${leagueId}
  `;
  return rows.length > 0;
}

export type AddLeagueResult =
  | { ok: true; alreadyHad: boolean }
  | { ok: false; error: "quota-exceeded" };

/**
 * Adds a league to an account, enforcing the free-tier quota.
 *
 * Re-adding a league the user already holds is a no-op success, not a quota
 * failure — otherwise a free user with one league could never re-visit their
 * own league entry flow.
 */
export async function addLeagueToUser(
  userId: string,
  leagueId: string,
  plan: UserPlan
): Promise<AddLeagueResult> {
  if (await userHasLeague(userId, leagueId)) {
    return { ok: true, alreadyHad: true };
  }

  if (plan !== "premium") {
    const existing = await countUserLeagues(userId);
    if (existing >= FREE_LEAGUE_LIMIT) {
      return { ok: false, error: "quota-exceeded" };
    }
  }

  await sql`
    INSERT INTO user_leagues (user_id, league_id)
    VALUES (${userId}, ${leagueId})
    ON CONFLICT (user_id, league_id) DO NOTHING
  `;
  return { ok: true, alreadyHad: false };
}

export async function removeLeagueFromUser(userId: string, leagueId: string): Promise<void> {
  await sql`
    DELETE FROM user_leagues WHERE user_id = ${userId} AND league_id = ${leagueId}
  `;
}
