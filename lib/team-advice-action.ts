"use server";

import { getRecentOddsHistory } from "./db/snapshot";
import { getLeagueData } from "./league-data";
import { computePositionsBelowHistoricalBaseline } from "./production-pace";
import { getTeamSos } from "./sos-action";
import { computeStandingsRanks } from "./standings";
import { type AdviceSignals, computeCoManagerAdvice } from "./team-advice";
import { getTeamContexts } from "./team-context";

const SLEEPER_BASE = "https://api.sleeper.app/v1";
const NFL_STATE_URL = `${SLEEPER_BASE}/state/nfl`;
// Applied when the league doesn't express a trade deadline as a week number:
// Sleeper leaves it unset on leagues that disable trading and on older
// seasons, and ESPN stores a timestamp rather than a week (see LeagueInfo's
// tradeDeadlineWeek). Better a reasonable common default than an open-ended
// active-trading window.
const DEFAULT_TRADE_DEADLINE_WEEK = 12;

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
  const [{ league, rosters }, { teams, values }, oddsHistory, currentWeek, sosEntries] =
    await Promise.all([
      getLeagueData(leagueId),
      getTeamContexts(leagueId),
      getRecentOddsHistory(leagueId, rosterId),
      getCurrentWeek(),
      getTeamSos(leagueId, rosterId),
    ]);

  const tradeDeadlineWeek = league.tradeDeadlineWeek ?? DEFAULT_TRADE_DEADLINE_WEEK;
  const team = teams.find((t) => t.rosterId === rosterId);
  const ranks = computeStandingsRanks(rosters).get(rosterId);
  if (!team || !ranks) return null;

  // Only starters whose near-term SOS is already brutal become a sell-high
  // candidate — computeCoManagerAdvice further gates this to Stage 2 only.
  const sellHighCandidates = sosEntries
    .filter((entry) => entry.sos.nearTerm.tier === "brutal")
    .map((entry) => ({ position: entry.position, playerName: entry.name }));

  // Depends on team.rosterPlayerIds, so it can't join the batch above — a
  // real-production check (lib/production-pace.ts) against the historical
  // baselines, independent of and secondary to the market-value-based
  // thinPositions check.
  const valuesById = new Map(values.map((player) => [player.sleeperId, player]));
  const positionsBelowHistoricalBaseline = await computePositionsBelowHistoricalBaseline(
    leagueId,
    team.rosterPlayerIds,
    valuesById
  );

  return computeCoManagerAdvice({
    currentWeek,
    tradeDeadlineWeek,
    recordRank: ranks.recordRank,
    pfRank: ranks.pfRank,
    totalTeams: rosters.length,
    thinPositions: team.thinPositions,
    positionStrength: team.positionStrength,
    oddsHistory,
    sellHighCandidates,
    positionsBelowHistoricalBaseline,
  });
}
