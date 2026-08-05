// Sleeper weekly projections, shared by the trade odds preview
// (lib/trade-odds-action.ts) and the trade finder. Kept out of any
// "use server" module so non-action callers (the finder's input assembly,
// the dry-run script) can use it without going through a server action.

const NFL_STATE_URL = "https://api.sleeper.app/v1/state/nfl";
const PROJECTIONS_BASE = "https://api.sleeper.app/projections/nfl";
const PROJECTION_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"];
// Matches lib/http.ts's fetchJson default — these fetches bypass that helper
// (they need their own try/catch-with-fallback rather than a thrown error),
// but still shouldn't be able to hang indefinitely.
const FETCH_TIMEOUT_MS = 12000;

/**
 * Best-effort "which week to rank hypothetical lineups against". The real
 * point simulation in getPlayoffOdds() determines the actual next unplayed
 * week per league from matchup data; duplicating that here would be a lot of
 * extra fetching just to pick a ranking week, so this uses the live NFL week.
 *
 * Never returns 0: both fields read 0 during the preseason and `?? 1` doesn't
 * catch that, and the week-0 projections endpoint responds with a full player
 * list of all-zero points — which silently degrades lineup assignment to
 * array order. Week 1 is the right target then anyway, being the next week
 * that will actually be played.
 */
export async function getCurrentNflWeek(): Promise<number> {
  try {
    const res = await fetch(NFL_STATE_URL, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return 1;
    const state = (await res.json()) as { week?: number; display_week?: number };
    const week = state.week && state.week > 0 ? state.week : (state.display_week ?? 0);
    return week > 0 ? week : 1;
  } catch {
    return 1;
  }
}

// Ranking-only: uses PPR points regardless of the league's actual scoring
// format. This only decides which candidate is chosen to start, not the
// simulated point value (getPlayoffOdds() applies the league's real scoring),
// so exact format-matching isn't worth a second league-settings fetch here.
//
// The full-league, all-position payload is a couple MB — over Next's 2MB
// fetch-cache entry limit, the same issue lib/sleeper.ts's getAllPlayers()
// has for its ~14MB payload — so this is cached manually in memory rather
// than through Next's built-in fetch cache.
const PROJECTIONS_CACHE_TTL_MS = 60 * 60 * 1000;
const projectionsCache = new Map<string, { data: Map<string, number>; fetchedAt: number }>();

export async function getWeeklyProjectedPoints(
  season: string,
  week: number
): Promise<Map<string, number>> {
  const cacheKey = `${season}:${week}`;
  const cached = projectionsCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < PROJECTIONS_CACHE_TTL_MS) {
    return cached.data;
  }

  const positionParams = PROJECTION_POSITIONS.map((pos) => `position[]=${pos}`).join("&");
  const url = `${PROJECTIONS_BASE}/${season}/${week}?season_type=regular&${positionParams}`;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return new Map();
    const projections = (await res.json()) as {
      player_id: string;
      stats?: Record<string, number>;
    }[];
    const data = new Map(projections.map((p) => [p.player_id, p.stats?.pts_ppr ?? 0]));
    projectionsCache.set(cacheKey, { data, fetchedAt: Date.now() });
    return data;
  } catch {
    return new Map();
  }
}
