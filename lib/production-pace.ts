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

/**
 * Positions where no rostered (FantasyCalc-valued) player is actually
 * scoring like a startable option this season, based on real weekly
 * production compared against historical positional baselines
 * (lib/position-baselines.ts) — independent of, and a check against,
 * computeThinPositions()'s market-value-based rank check in
 * lib/team-context.ts. Returns [] before there's enough of-the-season
 * sample to trust a pace extrapolation.
 */
export async function computePositionsBelowHistoricalBaseline(
  leagueId: string,
  rosterPlayerIds: string[],
  valuesById: Map<string, TradeablePlayer>
): Promise<string[]> {
  const [league, leagueDetail, currentWeek] = await Promise.all([
    getLeague(leagueId),
    getLeagueDetail(leagueId),
    getCurrentWeek(),
  ]);

  const completedWeeks = currentWeek - 1;
  if (completedWeeks < MIN_COMPLETED_WEEKS_FOR_PACE) return [];

  const regularSeasonWeeks =
    leagueDetail.settings?.playoff_week_start && leagueDetail.settings.playoff_week_start > 1
      ? leagueDetail.settings.playoff_week_start - 1
      : FALLBACK_REGULAR_SEASON_WEEKS;
  const format = pprValueToFormat(leagueDetail.scoring_settings?.rec);
  const requiredStarters = countStarterSlots(league.roster_positions);

  const weeklyMatchups = await Promise.all(
    Array.from({ length: completedWeeks }, (_, i) => getMatchups(leagueId, i + 1))
  );

  // Every roster in the league appears in each week's response, but we only
  // ever look up IDs from our own rosterPlayerIds below, so summing every
  // matchup's players_points into one pool (rather than filtering by
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

  const flagged: string[] = [];

  for (const position of STARTER_POSITIONS) {
    const threshold = requiredStarters[position];
    if (!threshold) continue;

    const tier = nearestTier(threshold * league.total_rosters);
    const baseline = await getPositionBaseline(position, format, tier, { seasons: 3 });
    if (baseline === null) continue; // no baseline data — nothing to compare against

    const positionPlayerIds = rosterPlayerIds.filter(
      (id) => valuesById.get(id)?.position === position
    );

    const anyClearsBaseline = positionPlayerIds.some((id) => {
      const pace = ((pointsToDate.get(id) ?? 0) / completedWeeks) * regularSeasonWeeks;
      return pace >= baseline;
    });

    if (!anyClearsBaseline) flagged.push(position);
  }

  return flagged;
}
