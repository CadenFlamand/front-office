"use server";

import { getRecentOddsHistory } from "./db/snapshot";

// A wider window than the co-manager advice signal's default of 4 — this
// feeds a visual trend line rather than a single "went up/down" sentence, so
// showing more of the season (when it exists) makes for a more legible
// sparkline. Harmless to ask for more than actually exists: the underlying
// query is naturally bounded by how many rows are really there.
const TREND_WEEKS = 8;

/**
 * On-demand per-team odds history for the dashboard's trend sparkline, same
 * on-demand shape as lib/team-advice-action.ts's getCoManagerAdvice and
 * lib/roster-action.ts's getTeamRoster (leagueId + rosterId in, does its own
 * fetching internally) — team selection lives in localStorage (client-only),
 * so this is fetched from the client once a team is actually selected.
 */
export async function getOddsTrendHistory(
  leagueId: string,
  rosterId: number
): Promise<{ week: number; playoffOdds: number }[]> {
  return getRecentOddsHistory(leagueId, rosterId, TREND_WEEKS);
}
