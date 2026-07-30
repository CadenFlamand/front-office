import { fetchJson } from "./http";

const STATS_BASE = "https://api.sleeper.app/stats/nfl";

// Sleeper's stats endpoint (unlike projections) carries real opponent data
// for completed weeks — verified against the live API before building this.
interface SleeperStatsEntry {
  opponent: string | null;
  stats?: Record<string, number>;
}

export interface DefenseRankingResult {
  // team -> rank, 1 = stingiest defense against this position ... N = most
  // generous. null when there's no completed week to rank yet (start of
  // season) — the spec's "not enough data" state.
  ranks: Map<string, number> | null;
  totalTeams: number;
}

// Same scoring-format lookup as lib/playoff-odds.ts's projectionField(),
// duplicated locally rather than imported — matches this codebase's
// established per-module independence convention (see e.g. the three other
// standalone getCurrentWeek() copies).
function scoringField(pprValue: number | undefined): "pts_ppr" | "pts_half_ppr" | "pts_std" {
  if (pprValue === 1) return "pts_ppr";
  if (pprValue === 0.5) return "pts_half_ppr";
  return "pts_std";
}

function getWeekStats(
  season: string,
  week: number,
  position: string
): Promise<SleeperStatsEntry[]> {
  const url = `${STATS_BASE}/${season}/${week}?season_type=regular&position[]=${position}`;
  return fetchJson<SleeperStatsEntry[]>(url, { cache: "no-store" });
}

// Expensive to compute (up to `throughWeek` fetches) but the cache key
// space is small (4 positions x a handful of common PPR values, one
// throughWeek at a time) and the result is identical for every
// league/user, so this should rarely miss in practice.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { result: DefenseRankingResult; fetchedAt: number }>();

/**
 * Ranks all 32 NFL teams by how many fantasy points they've allowed to a
 * given position, season-to-date through `throughWeek` — the same
 * underlying method paid tools like FantasyPros use, computed here from
 * Sleeper's own weekly stats. Feeds lib/sos.ts's "bottom 10 defenses =
 * favorable matchup" check.
 */
export async function getDefenseRankings(
  season: string,
  throughWeek: number,
  position: "QB" | "RB" | "WR" | "TE",
  pprValue: number | undefined
): Promise<DefenseRankingResult> {
  if (throughWeek < 1) return { ranks: null, totalTeams: 0 };

  const cacheKey = `${season}:${throughWeek}:${position}:${pprValue ?? "std"}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.result;
  }

  const field = scoringField(pprValue);
  const weeks = Array.from({ length: throughWeek }, (_, i) => i + 1);
  const weeklyStats = await Promise.all(
    weeks.map((week) => getWeekStats(season, week, position))
  );

  const pointsAllowed = new Map<string, number>();
  const gamesPlayed = new Map<string, number>();

  for (const entries of weeklyStats) {
    // A defense can face multiple players at the same position in one week
    // (e.g. a committee backfield) — sum all of them, but only count the
    // week once per defense for the games-played denominator below.
    const defensesThisWeek = new Set<string>();
    for (const entry of entries) {
      if (!entry.opponent) continue;
      const points = entry.stats?.[field] ?? 0;
      pointsAllowed.set(entry.opponent, (pointsAllowed.get(entry.opponent) ?? 0) + points);
      defensesThisWeek.add(entry.opponent);
    }
    for (const defense of defensesThisWeek) {
      gamesPlayed.set(defense, (gamesPlayed.get(defense) ?? 0) + 1);
    }
  }

  // Per-game average, not raw total — a team on a bye during part of the
  // lookback window shouldn't look artificially stingy just for having
  // played fewer games.
  const averages = Array.from(gamesPlayed.keys()).map((team) => ({
    team,
    perGame: (pointsAllowed.get(team) ?? 0) / (gamesPlayed.get(team) ?? 1),
  }));
  averages.sort((a, b) => a.perGame - b.perGame);

  const ranks = new Map<string, number>();
  averages.forEach((entry, i) => ranks.set(entry.team, i + 1));

  const result: DefenseRankingResult = { ranks, totalTeams: averages.length };
  cache.set(cacheKey, { result, fetchedAt: Date.now() });
  return result;
}
