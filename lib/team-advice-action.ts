"use server";

import { getRecentOddsHistory } from "./db/snapshot";
import { fetchJson } from "./http";
import { computeStandingsRanks } from "./standings";
import { getRosters } from "./sleeper";
import { type AdviceSignals, computeCoManagerAdvice } from "./team-advice";
import { getTeamContexts } from "./team-context";

// Not exposed by lib/sleeper.ts's SleeperLeague type, and not worth adding
// there just for this — same "fetch the same endpoint again for one extra
// field" approach lib/team-context.ts uses for scoring_settings. Next.js
// dedupes identical fetch()s within a request, so this doesn't cost an
// extra round trip in practice.
const SLEEPER_BASE = "https://api.sleeper.app/v1";
const NFL_STATE_URL = `${SLEEPER_BASE}/state/nfl`;
// Sleeper doesn't set this for every league (e.g. leagues that disable
// trading, or older seasons); fall back to a reasonable common default
// rather than leaving the active-trading window open-ended.
const DEFAULT_TRADE_DEADLINE_WEEK = 12;

interface SleeperLeagueSettings {
  settings: { trade_deadline?: number } | null;
}

async function getTradeDeadlineWeek(leagueId: string): Promise<number> {
  const league = await fetchJson<SleeperLeagueSettings>(
    `${SLEEPER_BASE}/league/${leagueId}`,
    { next: { revalidate: 3600 } }
  );
  const week = league.settings?.trade_deadline;
  return week && week > 0 ? week : DEFAULT_TRADE_DEADLINE_WEEK;
}

// Duplicated rather than imported from lib/db/snapshot.ts / lib/trade-odds-
// action.ts, matching this codebase's established convention of keeping
// each module's Sleeper fetches independent (see the comments on those two
// copies) rather than introducing a cross-module dependency for one helper.
async function getCurrentWeek(): Promise<number> {
  const res = await fetch(NFL_STATE_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch current NFL week (${res.status})`);
  }
  const state = (await res.json()) as { week?: number; display_week?: number };
  return state.week && state.week > 0 ? state.week : (state.display_week ?? 1);
}

/**
 * Computes co-manager advice for one team, on demand. Not precomputed for
 * every team on dashboard load — the visitor's team selection lives in
 * localStorage (client-only), so this is fetched from the client once a
 * team is actually selected, the same on-demand shape as
 * lib/trade-odds-action.ts's getOddsForTrade.
 */
export async function getCoManagerAdvice(
  leagueId: string,
  rosterId: number
): Promise<AdviceSignals | null> {
  const [rosters, { teams }, oddsHistory, currentWeek, tradeDeadlineWeek] = await Promise.all([
    getRosters(leagueId),
    getTeamContexts(leagueId),
    getRecentOddsHistory(leagueId, rosterId),
    getCurrentWeek(),
    getTradeDeadlineWeek(leagueId),
  ]);

  const team = teams.find((t) => t.rosterId === rosterId);
  const ranks = computeStandingsRanks(rosters).get(rosterId);
  if (!team || !ranks) return null;

  return computeCoManagerAdvice({
    currentWeek,
    tradeDeadlineWeek,
    recordRank: ranks.recordRank,
    pfRank: ranks.pfRank,
    totalTeams: rosters.length,
    thinPositions: team.thinPositions,
    positionStrength: team.positionStrength,
    oddsHistory,
  });
}
