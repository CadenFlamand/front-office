import type { WaiverValue } from "./fantasypros-waiver-values";
import {
  computeWeakPositionFlags,
  type PositionStrength,
  type StarterPosition,
  type WeakPositionReason,
} from "./team-context";

export interface WaiverRecommendation {
  sleeperId: string;
  playerName: string;
  position: string;
  team: string | null;
  waiverRank: number;
}

export interface NeedBasedWaiverRecommendation extends WaiverRecommendation {
  // Which flagged need(s) this position addresses — usually one, but RB/WR
  // can be both "weak" and "thin" at once (see lib/team-context.ts's
  // computeWeakPositionFlags()), so a single pickup can address both.
  reasons: WeakPositionReason[];
}

export interface WaiverRecommendations {
  needBased: NeedBasedWaiverRecommendation[];
  bestAvailable: WaiverRecommendation[];
  // Whether fantasypros_waiver_values has been ingested at all yet —
  // distinguishes "no waiver rankings published this season" (the real
  // state until scripts/ingest-fantasypros-waiver.ts has real data to run
  // against) from "rankings exist, nothing happens to be available right
  // now", which read as very different messages to the user.
  hasWaiverData: boolean;
}

const DEFAULT_LIMIT = 15;

/**
 * Splits the league's waiver-wire consensus ranking into two sections for
 * one team: available players at positions the team is flagged weak/thin
 * at, then the best available players league-wide regardless of need.
 *
 * Need uses lib/team-context.ts's computeWeakPositionFlags() with
 * thinPositions included (the same evaluation co-manager advice already
 * shows this user) rather than the trade finder's stripped-down version —
 * that module deliberately drops the thinPositions safety net because it
 * was over-firing for a *matching* engine (see its NO_LEAGUE_FORMAT_FLAGS
 * comment). This is an advisory feature like co-manager advice, not a
 * matching engine, so it should agree with what advice already tells the
 * user rather than introduce a third definition of "weak".
 *
 * "Available" means not rostered by any team in the league, not just this
 * one — a player on someone else's roster isn't on the waiver wire.
 */
export function computeWaiverRecommendations(
  allWaiverValues: WaiverValue[],
  allRosteredPlayerIds: Set<string>,
  thinPositions: string[],
  positionStrength: Record<StarterPosition, PositionStrength>,
  limit = DEFAULT_LIMIT
): WaiverRecommendations {
  // allWaiverValues arrives sorted best-first (see getWaiverValues());
  // filtering preserves that order, so neither section needs a re-sort.
  const available = allWaiverValues.filter(
    (player) => !allRosteredPlayerIds.has(player.sleeperId)
  );

  const needs = computeWeakPositionFlags(thinPositions, positionStrength);
  const reasonsByPosition = new Map<string, WeakPositionReason[]>();
  for (const flag of needs) {
    const list = reasonsByPosition.get(flag.position) ?? [];
    list.push(flag.reason);
    reasonsByPosition.set(flag.position, list);
  }

  const needBased = available
    .flatMap((player) => {
      const reasons = reasonsByPosition.get(player.position);
      return reasons ? [{ ...player, reasons }] : [];
    })
    .slice(0, limit);

  const bestAvailable = available.slice(0, limit);

  return { needBased, bestAvailable, hasWaiverData: allWaiverValues.length > 0 };
}
