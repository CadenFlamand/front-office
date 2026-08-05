"use server";

import { getPlayoffOdds } from "./playoff-odds";
import { getAllPlayers, getLeague, getRosters } from "./sleeper";

export interface TradeOddsDiff {
  before: number;
  after: number;
}

// Not exposed by lib/sleeper.ts and not league-scoped, so fetched directly
// here rather than duplicating a LEAGUE_ID constant.
const NFL_STATE_URL = "https://api.sleeper.app/v1/state/nfl";
const PROJECTIONS_BASE = "https://api.sleeper.app/projections/nfl";
const PROJECTION_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"];
// Matches lib/http.ts's fetchJson default — these two fetches bypass that
// helper (they need their own try/catch-with-fallback rather than a thrown
// error), but still shouldn't be able to hang indefinitely.
const FETCH_TIMEOUT_MS = 12000;

// Best-effort "which week to rank hypothetical-lineup candidates against".
// The real point simulation in getPlayoffOdds() determines the actual next
// unplayed week per league from matchup data; duplicating that here would
// be a lot of extra fetching just to pick a ranking week, so this uses the
// live NFL week instead. For a league whose season doesn't match the
// current real-world season (e.g. testing against a past/completed
// season), this degrades gracefully: no usable projections will be found
// and ranking falls back to candidate list order (see getRankedCandidates).
async function getCurrentNflWeek(): Promise<number> {
  try {
    const res = await fetch(NFL_STATE_URL, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return 1;
    const state = (await res.json()) as { week?: number; display_week?: number };
    const week = state.week && state.week > 0 ? state.week : (state.display_week ?? 0);
    // Both fields read 0 during the preseason, and `?? 1` doesn't catch that
    // (0 isn't nullish) — which meant this returned week 0, whose projections
    // endpoint responds with a full player list of all-zero points. Every
    // candidate then tied at 0 and assignLineup() below fell back to picking
    // by array order. Week 1 is the right target in the preseason anyway:
    // it's the next week that will actually be played, which is also what
    // getPlayoffOdds() independently derives from matchup data.
    return week > 0 ? week : 1;
  } catch {
    return 1;
  }
}

// Ranking-only: uses PPR points regardless of the league's actual scoring
// format. This only decides which candidate is chosen to start, not the
// simulated point value (getPlayoffOdds() applies the league's real
// scoring), so exact format-matching isn't worth a second league-settings
// fetch here.
//
// The full-league, all-position payload here is a couple MB — over Next's
// 2MB fetch-cache entry limit (same issue lib/sleeper.ts's getAllPlayers()
// has for its ~14MB payload) — so this is cached manually in memory rather
// than through Next's built-in fetch cache.
const PROJECTIONS_CACHE_TTL_MS = 60 * 60 * 1000;
const projectionsCache = new Map<string, { data: Map<string, number>; fetchedAt: number }>();

async function getWeeklyProjectedPoints(
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

function slotEligiblePositions(slot: string): string[] {
  return slot.includes("FLEX") ? ["RB", "WR", "TE"] : [slot];
}

interface Candidate {
  playerId: string;
  position: string;
  projectedPts: number;
}

// Greedily assigns candidates to starting slots: dedicated single-position
// slots (QB/RB/WR/TE/DEF/K/...) are filled first, each with its highest-
// projected eligible remaining candidate, then FLEX-type slots are filled
// from whatever's left. Filling dedicated slots first avoids a FLEX slot
// claiming a player who was the only eligible option for a dedicated slot.
// A slot with no eligible candidate left is simply skipped, so the result
// can be shorter than startingSlots but never longer.
function assignLineup(startingSlots: string[], candidates: Candidate[]): string[] {
  const dedicatedSlots = startingSlots.filter((slot) => !slot.includes("FLEX"));
  const flexSlots = startingSlots.filter((slot) => slot.includes("FLEX"));

  const used = new Set<string>();
  const lineup: string[] = [];

  for (const slot of [...dedicatedSlots, ...flexSlots]) {
    const eligible = slotEligiblePositions(slot);
    let best: Candidate | null = null;
    for (const candidate of candidates) {
      if (used.has(candidate.playerId)) continue;
      if (!eligible.includes(candidate.position)) continue;
      if (!best || candidate.projectedPts > best.projectedPts) best = candidate;
    }
    if (best) {
      used.add(best.playerId);
      lineup.push(best.playerId);
    }
  }

  return lineup;
}

/**
 * Compares a team's playoff odds today against a hypothetical odds run
 * where `giveIds` are removed and `receiveIds` are added to its lineup, so
 * the trade analyzer can preview a trade's playoff impact without mutating
 * any real Sleeper data.
 *
 * Neither lineup is just "starters plus whatever was received appended on"
 * — that would let a received bench-quality player count as a full extra
 * starter. Both are rebuilt position-slot by position-slot (see
 * assignLineup) from the full roster available to that side of the trade,
 * so a received player only affects the projection if they'd actually earn
 * a starting spot, and a traded-away starter's slot gets backfilled from
 * the bench the way a real manager would fill it.
 *
 * Because both sides are optimized, `before` here is the team's best-lineup
 * odds, which can read slightly higher than the odds shown on the dashboard
 * — those reflect the manager's actual current starters. The two agree
 * whenever the current lineup is already the highest-projecting one.
 */
export async function getOddsForTrade(
  leagueId: string,
  rosterId: number,
  giveIds: string[],
  receiveIds: string[]
): Promise<TradeOddsDiff | null> {
  const [rosters, league] = await Promise.all([
    getRosters(leagueId),
    getLeague(leagueId),
  ]);
  const roster = rosters.find((r) => r.roster_id === rosterId);
  if (!roster) return null;

  const startingSlots = league.roster_positions.filter(
    (slot) => slot !== "BN" && slot !== "IR"
  );

  const giveSet = new Set(giveIds);
  const currentRosterIds = (roster.players ?? []).filter((id) => id && id !== "0");
  const postTradeRosterIds = [
    ...currentRosterIds.filter((id) => !giveSet.has(id)),
    ...receiveIds,
  ];

  const [allPlayers, currentWeek] = await Promise.all([
    getAllPlayers(),
    getCurrentNflWeek(),
  ]);
  const projectedPtsById = await getWeeklyProjectedPoints(league.season, currentWeek);

  function toCandidates(ids: string[]): Candidate[] {
    return ids.flatMap((id) => {
      const position = allPlayers[id]?.position;
      if (!position) return [];
      return [{ playerId: id, position, projectedPts: projectedPtsById.get(id) ?? 0 }];
    });
  }

  // Both sides of the comparison are the best lineup fieldable from that
  // roster, so the delta isolates the trade itself.
  //
  // The hypothetical side used to draw only from (remaining starters +
  // received), never the bench. Trading away a starter left that slot
  // permanently empty — the team was charged the full starter's points and
  // credited nothing back — which penalized every trade that gave up a
  // starter, i.e. almost all of them. Drawing from the whole roster fixes
  // that, but it also means the lineup is now optimized rather than taken
  // as-is, so the baseline has to be optimized the same way or the
  // comparison silently rewards re-setting a lineup as if it were the
  // trade's doing.
  const currentStarters = assignLineup(startingSlots, toCandidates(currentRosterIds));
  const postTradeStarters = assignLineup(startingSlots, toCandidates(postTradeRosterIds));

  const [baseline, hypothetical] = await Promise.all([
    getPlayoffOdds(leagueId, { rosterOverrides: new Map([[rosterId, currentStarters]]) }),
    getPlayoffOdds(leagueId, { rosterOverrides: new Map([[rosterId, postTradeStarters]]) }),
  ]);

  const before = baseline.find((t) => t.rosterId === rosterId)?.playoffOdds;
  const after = hypothetical.find((t) => t.rosterId === rosterId)?.playoffOdds;
  if (before === undefined || after === undefined) return null;

  return { before, after };
}
