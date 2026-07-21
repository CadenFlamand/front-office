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
    const res = await fetch(NFL_STATE_URL, { next: { revalidate: 3600 } });
    if (!res.ok) return 1;
    const state = (await res.json()) as { week?: number; display_week?: number };
    return state.week && state.week > 0 ? state.week : (state.display_week ?? 1);
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
    const res = await fetch(url, { cache: "no-store" });
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
 * The hypothetical lineup isn't just the remaining starters plus whatever
 * was received appended on — that would let a received bench-quality
 * player count as a full extra starter. Instead it's rebuilt position-slot
 * by position-slot (see assignLineup) from the remaining starters and the
 * received players, so a received player only affects the projection if
 * they'd actually earn a starting spot.
 */
export async function getOddsForTrade(
  rosterId: number,
  giveIds: string[],
  receiveIds: string[]
): Promise<TradeOddsDiff | null> {
  const [rosters, league] = await Promise.all([getRosters(), getLeague()]);
  const roster = rosters.find((r) => r.roster_id === rosterId);
  if (!roster) return null;

  const startingSlots = league.roster_positions.filter(
    (slot) => slot !== "BN" && slot !== "IR"
  );

  const giveSet = new Set(giveIds);
  const remainingStarterIds = (roster.starters ?? []).filter(
    (id) => id && id !== "0" && !giveSet.has(id)
  );
  const candidateIds = [...remainingStarterIds, ...receiveIds];

  const [allPlayers, currentWeek] = await Promise.all([
    getAllPlayers(),
    getCurrentNflWeek(),
  ]);
  const projectedPtsById = await getWeeklyProjectedPoints(league.season, currentWeek);

  const candidates: Candidate[] = candidateIds.flatMap((id) => {
    const position = allPlayers[id]?.position;
    if (!position) return [];
    return [{ playerId: id, position, projectedPts: projectedPtsById.get(id) ?? 0 }];
  });

  const hypotheticalStarters = assignLineup(startingSlots, candidates);
  const rosterOverrides = new Map([[rosterId, hypotheticalStarters]]);

  const [baseline, hypothetical] = await Promise.all([
    getPlayoffOdds(),
    getPlayoffOdds({ rosterOverrides }),
  ]);

  const before = baseline.find((t) => t.rosterId === rosterId)?.playoffOdds;
  const after = hypothetical.find((t) => t.rosterId === rosterId)?.playoffOdds;
  if (before === undefined || after === undefined) return null;

  return { before, after };
}
