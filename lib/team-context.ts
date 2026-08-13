import { getPlayerValues, type TradeablePlayer } from "./fantasycalc";
import { getLeagueData } from "./league-data";
import { formatRecord, managerDisplayName, managerTeamName } from "./league-types";
import { getPlayoffOdds } from "./playoff-odds";

export type PlayoffBucket =
  | "Playoff Favorite"
  | "Playoff Contender"
  | "Playoff Hopeful";

export interface PositionStrength {
  rosterCount: number;
  // null = no FantasyCalc-valued player rostered at this position at all.
  bestPositionRank: number | null;
  top20Count: number;
}

export interface TeamContext {
  rosterId: number;
  teamName: string;
  ownerName: string;
  record: string;
  bucket: PlayoffBucket;
  thinPositions: string[];
  // Positions with more startable depth than the lineup requires — the
  // trade-leverage side of thinPositions, same league-format bar (see
  // computeSurplusPositions).
  surplusPositions: string[];
  positionStrength: Record<(typeof STARTER_POSITIONS)[number], PositionStrength>;
  // Sleeper IDs of this team's rostered players that also have a FantasyCalc
  // value (i.e. tradeable skill players) — used to scope "You Give" to this
  // team's actual roster instead of the full league player pool.
  rosterPlayerIds: string[];
}

const STARTER_POSITIONS = ["QB", "RB", "WR", "TE"] as const;
const STARTER_POSITION_SET = new Set<string>(STARTER_POSITIONS);

export type StarterPosition = (typeof STARTER_POSITIONS)[number];

function slotEligiblePositions(slot: string): string[] {
  return slot.includes("FLEX") ? ["RB", "WR", "TE"] : [slot];
}

export function countStarterSlots(rosterPositions: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const position of STARTER_POSITIONS) counts[position] = 0;

  for (const slot of rosterPositions) {
    // A FLEX-type slot doesn't require a specific position, so it's split
    // proportionally across the positions it's eligible for (RB/WR/TE)
    // rather than counted fully against each — a league with 1 FLEX slot
    // needs "1 more flex-eligible player", not "1 more RB AND 1 more WR
    // AND 1 more TE".
    const eligible = slotEligiblePositions(slot).filter((position) =>
      STARTER_POSITION_SET.has(position)
    );
    if (eligible.length === 0) continue;
    const share = 1 / eligible.length;
    for (const position of eligible) counts[position] += share;
  }

  return counts;
}

// Round-number playoff-odds cutoffs: 70%+ is a clear favorite, under 30% is
// a real longshot, and the 30-70% band in between is a genuine contender —
// not yet calibrated against real mid-season odds spreads (see the caveats
// on lib/playoff-odds.ts's actuals/projection blending), so revisit once a
// real season's in-progress odds are available to sanity-check against.
const FAVORITE_ODDS_THRESHOLD = 0.7;
const CONTENDER_ODDS_THRESHOLD = 0.3;

export function getPlayoffBucket(playoffOdds: number): PlayoffBucket {
  if (playoffOdds >= FAVORITE_ODDS_THRESHOLD) return "Playoff Favorite";
  if (playoffOdds >= CONTENDER_ODDS_THRESHOLD) return "Playoff Contender";
  return "Playoff Hopeful";
}

// Re-ranks the full valued-player pool by composite value (FantasyCalc +
// FantasyPros blend, see lib/fantasycalc.ts's getPlayerValues()) within
// each position, rather than using FantasyCalc's own raw positionRank
// field — which last session's value-blending deliberately left untouched.
// Both computeThinPositions() and computePositionStrength() read this now,
// so "is this position startable" means the same thing everywhere in the
// app instead of only being composite-aware for trade value specifically.
export function computeCompositePositionRanks(
  valuesById: Map<string, TradeablePlayer>
): Map<string, number> {
  const byPosition = new Map<string, TradeablePlayer[]>();
  for (const player of valuesById.values()) {
    const list = byPosition.get(player.position) ?? [];
    list.push(player);
    byPosition.set(player.position, list);
  }

  const ranks = new Map<string, number>();
  for (const players of byPosition.values()) {
    players.sort((a, b) => b.value - a.value);
    players.forEach((player, index) => ranks.set(player.sleeperId, index + 1));
  }
  return ranks;
}

function computeThinPositions(
  rosterPlayerIds: string[],
  valuesById: Map<string, TradeablePlayer>,
  compositeRanks: Map<string, number>,
  requiredStarters: Record<string, number>,
  totalRosters: number
): string[] {
  // "Startable" = ranked within the league-wide universe of players good
  // enough to fill every team's dedicated slots at that position, where a
  // FLEX-type slot's requirement is split proportionally across the
  // positions it's eligible for (see countStarterSlots) rather than
  // counted fully against each. A player who doesn't even show up in the
  // composite valued pool is, by definition, not startable.
  const startableCounts: Record<string, number> = {};
  for (const position of STARTER_POSITIONS) startableCounts[position] = 0;

  for (const playerId of rosterPlayerIds) {
    const player = valuesById.get(playerId);
    if (!player) continue;
    const threshold = requiredStarters[player.position];
    if (threshold === undefined) continue;
    const leagueWideStartableRank = threshold * totalRosters;
    const rank = compositeRanks.get(playerId);
    if (rank !== undefined && rank <= leagueWideStartableRank) {
      startableCounts[player.position] += 1;
    }
  }

  return STARTER_POSITIONS.filter(
    (position) => startableCounts[position] < requiredStarters[position]
  );
}

// A position counts as surplus when the roster has more startable players at
// it than the lineup requires — i.e. one can leave without opening a hole.
// Uses the same league-format-relative bar as computeThinPositions() above
// (this is a question about filling your own lineup, not league-wide
// quality), and deliberately never flags a position also passed in
// excludePositions — a position can't be both a hole and a place to trade
// from. Originally lived inline in lib/trade-finder.ts's computeRosterFit();
// extracted here once the co-manager advice strength signal became a second
// consumer of the exact same bar.
export function computeSurplusPositions(
  rosterPlayerIds: string[],
  valuesById: Map<string, TradeablePlayer>,
  compositeRanks: Map<string, number>,
  requiredStarters: Record<string, number>,
  totalRosters: number,
  excludePositions: Set<string> = new Set()
): string[] {
  const surplusPositions: string[] = [];
  for (const position of STARTER_POSITIONS) {
    if (excludePositions.has(position)) continue;
    const required = requiredStarters[position];
    if (!required) continue;

    const startableBar = required * totalRosters;
    const startable = rosterPlayerIds.filter((id) => {
      const player = valuesById.get(id);
      if (player?.position !== position) return false;
      const rank = compositeRanks.get(id);
      return rank !== undefined && rank <= startableBar;
    }).length;

    if (startable > required) surplusPositions.push(position);
  }
  return surplusPositions;
}

const TOP20_RANK = 20;

// Raw positional depth/strength, independent of league starter requirements
// — feeds the co-manager advice module's fixed-cutoff checks (top-7 QB/
// top-5 TE/top-20 RB-WR/roster-count), which are deliberately different
// from computeThinPositions()'s league-format-relative bar above. Only
// counts composite-valued players, same "no value = not real depth"
// philosophy as computeThinPositions().
export function computePositionStrength(
  rosterPlayerIds: string[],
  valuesById: Map<string, TradeablePlayer>,
  compositeRanks: Map<string, number>
): Record<(typeof STARTER_POSITIONS)[number], PositionStrength> {
  const strength: Record<string, PositionStrength> = {};
  for (const position of STARTER_POSITIONS) {
    strength[position] = { rosterCount: 0, bestPositionRank: null, top20Count: 0 };
  }

  for (const playerId of rosterPlayerIds) {
    const player = valuesById.get(playerId);
    if (!player || !STARTER_POSITION_SET.has(player.position)) continue;
    const rank = compositeRanks.get(playerId);
    if (rank === undefined) continue;

    const positionStrength = strength[player.position];
    positionStrength.rosterCount += 1;
    if (positionStrength.bestPositionRank === null || rank < positionStrength.bestPositionRank) {
      positionStrength.bestPositionRank = rank;
    }
    if (rank <= TOP20_RANK) positionStrength.top20Count += 1;
  }

  return strength as Record<(typeof STARTER_POSITIONS)[number], PositionStrength>;
}

// Fixed-cutoff weak/thin thresholds, applied to computePositionStrength()'s
// composite-ranked output above. Deliberately a different bar from
// computeThinPositions()'s league-format-relative check — "is your best guy
// actually good" (QB/TE) and "do you have enough good/enough bodies"
// (RB/WR), rather than "can you fill your exact starting lineup".
//
// These live here, next to the positionStrength they read, rather than in
// lib/team-advice.ts where they started — two consumers now need the same
// evaluation (co-manager advice's copy, and the trade finder's need
// signal), and duplicating four thresholds across both is exactly the
// second-definition problem the rest of this codebase avoids.
const QB_WEAK_RANK_THRESHOLD = 7;
const TE_WEAK_RANK_THRESHOLD = 5;
const RB_WR_MIN_TOP20_OPTIONS = 2;
const RB_WR_THIN_ROSTER_COUNT_THRESHOLD = 3; // flags at 3 or fewer rostered

const QB_TE_WEAK_RANK_THRESHOLD: Record<"QB" | "TE", number> = {
  QB: QB_WEAK_RANK_THRESHOLD,
  TE: TE_WEAK_RANK_THRESHOLD,
};

// "Elite" — a co-manager advice strength signal, deliberately tighter than
// the weak thresholds above rather than their inverse, so a position can't
// read as both weak and elite: QB/TE weak is "worse than top-7/top-5", elite
// is "top-3", leaving a real middle band that's neither. RB/WR weak is about
// *depth* (fewer than two top-20 options); elite here is about your single
// best option instead, since a team can have a legitimately elite RB1 while
// still being weak on options behind him — the exclusion that keeps those
// two signals from co-occurring lives in computeStrengthFlags(), not here.
const QB_ELITE_RANK_THRESHOLD = 3;
const TE_ELITE_RANK_THRESHOLD = 3;
const RB_WR_ELITE_RANK_THRESHOLD = 5;

const ELITE_RANK_THRESHOLD: Record<StarterPosition, number> = {
  QB: QB_ELITE_RANK_THRESHOLD,
  TE: TE_ELITE_RANK_THRESHOLD,
  RB: RB_WR_ELITE_RANK_THRESHOLD,
  WR: RB_WR_ELITE_RANK_THRESHOLD,
};

// "weak" = ranking-driven (or production-driven, see flaggedByRank below).
// "thin" = RB/WR roster-count only, an independent signal that can fire
// alongside "weak" for the same position.
export type WeakPositionReason = "weak" | "thin";

export interface WeakPositionFlag {
  position: StarterPosition;
  reason: WeakPositionReason;
  // For reason "weak": whether the roster-composition check (composite rank,
  // or computeThinPositions()'s league-format bar as a safety net) fired, as
  // opposed to this being a production-only flag where the rankings actually
  // look fine. Always true for reason "thin", which is a pure roster-count
  // fact.
  flaggedByRank: boolean;
  // Whether real production pace (lib/production-pace.ts) agrees. Always
  // false for reason "thin" — production only ever blends with "weak".
  backedByProduction: boolean;
  // Carried through so consumers don't have to reach back into
  // positionStrength to render or score the flag.
  rosterCount: number;
}

// QB/TE: streaming 1-2 deep is a normal, intentional strategy, so roster
// count isn't a signal here — only whether your best option is actually good.
function isQbTeWeak(
  position: "QB" | "TE",
  strength: PositionStrength,
  alreadyFlagged: boolean
): boolean {
  if (alreadyFlagged) return true;
  return (
    strength.bestPositionRank === null ||
    strength.bestPositionRank > QB_TE_WEAK_RANK_THRESHOLD[position]
  );
}

// RB/WR "weak" (ranking) and "thin" (roster count) are independent signals,
// not OR'd into one — a team can be one, the other, both, or neither.
// "Weak" has no "but you have one elite top-12 guy" escape hatch; it's
// purely whether there are 2+ genuinely startable (top-20) options.
function isRbWrWeak(strength: PositionStrength, alreadyFlagged: boolean): boolean {
  if (alreadyFlagged) return true;
  return strength.top20Count < RB_WR_MIN_TOP20_OPTIONS;
}

function isRbWrThinByCount(strength: PositionStrength): boolean {
  return strength.rosterCount <= RB_WR_THIN_ROSTER_COUNT_THRESHOLD;
}

/**
 * The single evaluation of "which positions is this roster weak or thin at",
 * blending the composite-rank checks above with lib/production-pace.ts's
 * real-production check. Returns structured flags with no display copy —
 * lib/team-advice.ts turns these into co-manager bullets, and the trade
 * finder scores against them directly.
 *
 * Emission order is QB, TE, then RB and WR (weak before thin within each),
 * which is the order the advice UI renders.
 */
export function computeWeakPositionFlags(
  thinPositions: string[],
  positionStrength: Record<StarterPosition, PositionStrength>,
  positionsBelowHistoricalBaseline: string[] = []
): WeakPositionFlag[] {
  const alreadyFlagged = new Set(thinPositions);
  const productionFlagged = new Set(positionsBelowHistoricalBaseline);
  const flags: WeakPositionFlag[] = [];

  for (const position of ["QB", "TE"] as const) {
    const strength = positionStrength[position];
    const flaggedByRank = isQbTeWeak(position, strength, alreadyFlagged.has(position));
    const backedByProduction = productionFlagged.has(position);
    if (flaggedByRank || backedByProduction) {
      flags.push({
        position,
        reason: "weak",
        flaggedByRank,
        backedByProduction,
        rosterCount: strength.rosterCount,
      });
    }
  }

  for (const position of ["RB", "WR"] as const) {
    const strength = positionStrength[position];
    const backedByProduction = productionFlagged.has(position);
    const weak = isRbWrWeak(strength, alreadyFlagged.has(position));

    // A production-only flag (rankings look fine, real scoring doesn't) is
    // still a "weak" flag — flaggedByRank is what tells the two apart.
    if (weak || backedByProduction) {
      flags.push({
        position,
        reason: "weak",
        flaggedByRank: weak,
        backedByProduction,
        rosterCount: strength.rosterCount,
      });
    }
    if (isRbWrThinByCount(strength)) {
      flags.push({
        position,
        reason: "thin",
        flaggedByRank: true,
        backedByProduction: false,
        rosterCount: strength.rosterCount,
      });
    }
  }

  return flags;
}

// "depth" = surplus roster count (computeSurplusPositions' league-format
// bar). "quality" = a single elite-ranked player, independent of depth. The
// two are independent per position, same as weak's "weak"/"thin" — a
// stacked-and-elite WR corps legitimately earns both. Neither ever fires for
// a position already in weakPositions: "here's leverage" and "here's a
// concern" are deliberately disjoint per position, so the advice card never
// says both about the same spot in the same breath.
export type StrengthReason = "depth" | "quality";

export interface StrengthFlag {
  position: StarterPosition;
  reason: StrengthReason;
  // For reason "quality" only — the composite rank that earned the flag.
  bestPositionRank?: number;
}

export function computeStrengthFlags(
  positionStrength: Record<StarterPosition, PositionStrength>,
  surplusPositions: string[],
  weakPositions: Set<string>
): StrengthFlag[] {
  const surplusSet = new Set(surplusPositions);
  const flags: StrengthFlag[] = [];

  for (const position of STARTER_POSITIONS) {
    if (weakPositions.has(position)) continue;

    if (surplusSet.has(position)) {
      flags.push({ position, reason: "depth" });
    }

    const rank = positionStrength[position].bestPositionRank;
    if (rank !== null && rank <= ELITE_RANK_THRESHOLD[position]) {
      flags.push({ position, reason: "quality", bestPositionRank: rank });
    }
  }

  return flags;
}

export async function getTeamContexts(leagueId: string): Promise<{
  teams: TeamContext[];
  values: TradeablePlayer[];
}> {
  const { league, rosters, managers } = await getLeagueData(leagueId);

  const [values, playoffOdds] = await Promise.all([
    getPlayerValues({
      totalRosters: league.totalRosters,
      pprValue: league.pprValue,
      rosterPositions: league.rosterPositions,
    }),
    getPlayoffOdds(leagueId),
  ]);

  const managersById = new Map(managers.map((manager) => [manager.ownerId, manager]));
  const valuesById = new Map(values.map((player) => [player.sleeperId, player]));
  const compositeRanks = computeCompositePositionRanks(valuesById);
  const oddsByRosterId = new Map(playoffOdds.map((o) => [o.rosterId, o.playoffOdds]));
  const requiredStarters = countStarterSlots(league.rosterPositions);

  const teams = rosters.map((roster) => {
    const manager = roster.ownerId ? managersById.get(roster.ownerId) : undefined;
    const rosterPlayerIds = roster.players.filter((id) => valuesById.has(id));

    const thinPositions = computeThinPositions(
      roster.players,
      valuesById,
      compositeRanks,
      requiredStarters,
      league.totalRosters
    );
    const positionStrength = computePositionStrength(rosterPlayerIds, valuesById, compositeRanks);
    // No production-pace data at this batch scope (that's a per-team,
    // on-demand DB lookup — see lib/team-advice-action.ts), so this exclusion
    // set is rank-only. Fine here: it's just deciding which positions
    // surplus is allowed to consider, not the weak flags shown to the user.
    const weakPositions = new Set(
      computeWeakPositionFlags(thinPositions, positionStrength).map((flag) => flag.position)
    );

    return {
      rosterId: roster.rosterId,
      teamName: managerTeamName(manager),
      ownerName: managerDisplayName(manager),
      record: formatRecord(roster),
      bucket: getPlayoffBucket(oddsByRosterId.get(roster.rosterId) ?? 0),
      thinPositions,
      surplusPositions: computeSurplusPositions(
        rosterPlayerIds,
        valuesById,
        compositeRanks,
        requiredStarters,
        league.totalRosters,
        weakPositions
      ),
      positionStrength,
      rosterPlayerIds,
    };
  });

  return { teams, values };
}
