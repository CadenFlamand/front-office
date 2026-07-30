import { fetchJson } from "./http";

const PROJECTIONS_BASE = "https://api.sleeper.app/projections/nfl";

// Sleeper's projections endpoint carries real team/opponent data for the
// current and future weeks (verified against the live API before building
// this — a fully past week's projections entry has `opponent: null`, so
// this module is only ever called for current/future weeks; historical
// opponents come from lib/defense-rankings.ts's stats-endpoint fetch
// instead). QB is the smallest position group and still covers every NFL
// team once per week, which is all a schedule lookup needs.
interface SleeperScheduleEntry {
  team: string | null;
  opponent: string | null;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { opponents: Map<string, string | null>; fetchedAt: number }>();

/**
 * Team -> opponent for one week, covering every NFL team in a single
 * request. `null` opponent means that team is on a bye that week. Cached
 * in-memory (season+week keyed) since the real schedule barely changes and
 * this is shared across every league/user hitting the app.
 */
export async function getTeamOpponents(
  season: string,
  week: number
): Promise<Map<string, string | null>> {
  const cacheKey = `${season}:${week}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.opponents;
  }

  const url = `${PROJECTIONS_BASE}/${season}/${week}?season_type=regular&position[]=QB`;
  const entries = await fetchJson<SleeperScheduleEntry[]>(url, { cache: "no-store" });

  const opponents = new Map<string, string | null>();
  for (const entry of entries) {
    if (!entry.team || opponents.has(entry.team)) continue;
    opponents.set(entry.team, entry.opponent);
  }

  cache.set(cacheKey, { opponents, fetchedAt: Date.now() });
  return opponents;
}
