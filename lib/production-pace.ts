import type { TradeablePlayer } from "./fantasycalc";
import { fetchJson } from "./http";
import { getPositionBaseline, pprValueToFormat, type BaselineTier } from "./position-baselines";
import { getLeague } from "./sleeper";
import { countStarterSlots } from "./team-context";

// Duplicated rather than imported — same "each module fetches independently"
// convention as lib/team-context.ts's getLeagueScoring() and every other
// module that needs one extra field off the league endpoint.
const SLEEPER_BASE = "https://api.sleeper.app/v1";
const NFL_STATE_URL = `${SLEEPER_BASE}/state/nfl`;

interface SleeperLeagueDetail {
  settings: { playoff_week_start?: number } | null;
  scoring_settings: { rec?: number } | null;
}

interface SleeperMatchup {
  players_points: Record<string, number> | null;
}

function getLeagueDetail(leagueId: string): Promise<SleeperLeagueDetail> {
  return fetchJson(`${SLEEPER_BASE}/league/${leagueId}`, { next: { revalidate: 3600 } });
}

function getMatchups(leagueId: string, week: number): Promise<SleeperMatchup[]> {
  return fetchJson(`${SLEEPER_BASE}/league/${leagueId}/matchups/${week}`, {
    next: { revalidate: 3600 },
  });
}

async function getCurrentWeek(): Promise<number> {
  const res = await fetch(NFL_STATE_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch current NFL week (${res.status})`);
  const state = (await res.json()) as { week?: number; display_week?: number };
  return state.week && state.week > 0 ? state.week : (state.display_week ?? 1);
}

const STARTER_POSITIONS = ["QB", "RB", "WR", "TE"] as const;

// A full NFL regular season, used as the fallback and the extrapolation
// target when a league doesn't expose playoff_week_start — same style as
// lib/playoff-odds.ts's regularSeasonWeeks derivation.
const FALLBACK_REGULAR_SEASON_WEEKS = 17;

// Pace off 1-2 games is too noisy to be worth surfacing — this is Stage 1's
// diagnostic window (weeks 1-4) colliding with the least reliable data, so
// this check deliberately stays silent until there's a slightly sturdier
// sample. Tunable like every other threshold in this app.
const MIN_COMPLETED_WEEKS_FOR_PACE = 3;

const BASELINE_TIER_RANKS: [number, BaselineTier][] = [
  [12, "top_12"],
  [24, "top_24"],
  [36, "top_36"],
];

function nearestTier(rank: number): BaselineTier {
  return BASELINE_TIER_RANKS.reduce((best, candidate) =>
    Math.abs(candidate[0] - rank) < Math.abs(best[0] - rank) ? candidate : best
  )[1];
}

export interface PlayerProductionPace {
  playerId: string;
  position: string;
  pointsToDate: number;
  // Points-to-date extrapolated across the full regular season at the
  // current rate.
  pace: number;
  // The startable-production threshold for this player's position, from
  // lib/position-baselines.ts.
  baseline: number;
  // pace / baseline. >= 1 means this player is actually producing like a
  // startable option at the position, < 1 means they aren't.
  ratio: number;
}

export interface LeagueProductionPace {
  completedWeeks: number;
  // Positions with both starter slots in this league and ingested baseline
  // data to compare against. A position absent here is one this check can't
  // speak to at all — which is deliberately different from a position that's
  // present and failing.
  baselineByPosition: Map<string, number>;
  // Keyed by Sleeper player ID, covering every valued player at a position
  // in baselineByPosition. Empty before MIN_COMPLETED_WEEKS_FOR_PACE, so an
  // absent player always reads as "no signal" rather than "no production".
  paceByPlayer: Map<string, PlayerProductionPace>;
}

/**
 * Real season-to-date production for every valued player in the league,
 * extrapolated to a full season and measured against historical positional
 * baselines (lib/position-baselines.ts).
 *
 * Computed league-wide in one pass because the underlying matchup payloads
 * already carry every roster's scoring, and the per-position baseline
 * lookups are uncached DB round trips — doing this per team would repeat
 * both for no benefit. Returns an empty paceByPlayer before there's enough
 * of-the-season sample to trust a pace extrapolation.
 */
export async function computeLeagueProductionPace(
  leagueId: string,
  valuesById: Map<string, TradeablePlayer>
): Promise<LeagueProductionPace> {
  const [league, leagueDetail, currentWeek] = await Promise.all([
    getLeague(leagueId),
    getLeagueDetail(leagueId),
    getCurrentWeek(),
  ]);

  const completedWeeks = Math.max(currentWeek - 1, 0);
  const empty: LeagueProductionPace = {
    completedWeeks,
    baselineByPosition: new Map(),
    paceByPlayer: new Map(),
  };
  if (completedWeeks < MIN_COMPLETED_WEEKS_FOR_PACE) return empty;

  const regularSeasonWeeks =
    leagueDetail.settings?.playoff_week_start && leagueDetail.settings.playoff_week_start > 1
      ? leagueDetail.settings.playoff_week_start - 1
      : FALLBACK_REGULAR_SEASON_WEEKS;
  const format = pprValueToFormat(leagueDetail.scoring_settings?.rec);
  const requiredStarters = countStarterSlots(league.roster_positions);

  const weeklyMatchups = await Promise.all(
    Array.from({ length: completedWeeks }, (_, i) => getMatchups(leagueId, i + 1))
  );

  // Every roster in the league appears in each week's response, so summing
  // every matchup's players_points into one pool (rather than filtering by
  // roster_id first) is simplest — a player only ever belongs to one roster
  // at a time anyway.
  const pointsToDate = new Map<string, number>();
  for (const week of weeklyMatchups) {
    for (const matchup of week) {
      for (const [playerId, points] of Object.entries(matchup.players_points ?? {})) {
        pointsToDate.set(playerId, (pointsToDate.get(playerId) ?? 0) + points);
      }
    }
  }

  const baselineByPosition = new Map<string, number>();
  for (const position of STARTER_POSITIONS) {
    const threshold = requiredStarters[position];
    if (!threshold) continue;
    const tier = nearestTier(threshold * league.total_rosters);
    const baseline = await getPositionBaseline(position, format, tier, { seasons: 3 });
    // A non-positive threshold would mean broken ingested data, not a bar
    // every player clears — treated as "can't speak to this position", same
    // as having no row at all.
    if (baseline === null || baseline <= 0) continue;
    baselineByPosition.set(position, baseline);
  }

  const paceByPlayer = new Map<string, PlayerProductionPace>();
  for (const player of valuesById.values()) {
    const baseline = baselineByPosition.get(player.position);
    if (baseline === undefined) continue;
    const points = pointsToDate.get(player.sleeperId) ?? 0;
    const pace = (points / completedWeeks) * regularSeasonWeeks;
    paceByPlayer.set(player.sleeperId, {
      playerId: player.sleeperId,
      position: player.position,
      pointsToDate: points,
      pace,
      baseline,
      ratio: baseline > 0 ? pace / baseline : 0,
    });
  }

  return { completedWeeks, baselineByPosition, paceByPlayer };
}

/**
 * Positions where no rostered player on this specific roster is actually
 * scoring like a startable option — a check against computeThinPositions()'s
 * market-value-based rank check in lib/team-context.ts, never a replacement
 * for it.
 *
 * A position is only flagged when there's real data to flag it on: positions
 * absent from baselineByPosition (no starter slots, or no ingested baseline)
 * are skipped entirely rather than counted as failing.
 */
export function computePositionsBelowBaselineForRoster(
  leaguePace: LeagueProductionPace,
  rosterPlayerIds: string[]
): string[] {
  const flagged: string[] = [];

  for (const position of STARTER_POSITIONS) {
    if (!leaguePace.baselineByPosition.has(position)) continue;

    const anyClearsBaseline = rosterPlayerIds.some((id) => {
      const pace = leaguePace.paceByPlayer.get(id);
      return pace?.position === position && pace.ratio >= 1;
    });
    // A position with nobody rostered at it has nobody clearing the bar, so
    // it flags — same as before this was extracted.
    if (!anyClearsBaseline) flagged.push(position);
  }

  return flagged;
}

/**
 * Single-roster convenience wrapper, preserving the original signature for
 * lib/team-advice-action.ts. Callers needing this for more than one roster
 * (the trade finder) should call computeLeagueProductionPace() once and feed
 * computePositionsBelowBaselineForRoster() instead.
 */
export async function computePositionsBelowHistoricalBaseline(
  leagueId: string,
  rosterPlayerIds: string[],
  valuesById: Map<string, TradeablePlayer>
): Promise<string[]> {
  // No separate too-early guard needed: before MIN_COMPLETED_WEEKS_FOR_PACE
  // baselineByPosition is empty too, so every position is skipped and this
  // returns [] — the same thing the pre-extraction version did.
  const leaguePace = await computeLeagueProductionPace(leagueId, valuesById);
  return computePositionsBelowBaselineForRoster(leaguePace, rosterPlayerIds);
}
