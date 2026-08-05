// Starting-lineup construction, shared by the trade odds preview
// (lib/trade-odds-action.ts) and the trade finder (lib/trade-finder.ts).
// Kept pure and free of "use server" so both can use the same definition of
// "the best lineup this roster can field" rather than each having its own.

export interface LineupCandidate {
  playerId: string;
  position: string;
  projectedPts: number;
}

export function slotEligiblePositions(slot: string): string[] {
  return slot.includes("FLEX") ? ["RB", "WR", "TE"] : [slot];
}

export function startingSlotsOf(rosterPositions: string[]): string[] {
  return rosterPositions.filter((slot) => slot !== "BN" && slot !== "IR");
}

/**
 * Greedily assigns candidates to starting slots: dedicated single-position
 * slots (QB/RB/WR/TE/DEF/K/...) are filled first, each with its highest-
 * projected eligible remaining candidate, then FLEX-type slots are filled
 * from whatever's left. Filling dedicated slots first avoids a FLEX slot
 * claiming a player who was the only eligible option for a dedicated slot.
 * A slot with no eligible candidate left is simply skipped, so the result
 * can be shorter than startingSlots but never longer.
 */
export function assignLineup(
  startingSlots: string[],
  candidates: LineupCandidate[]
): string[] {
  const dedicatedSlots = startingSlots.filter((slot) => !slot.includes("FLEX"));
  const flexSlots = startingSlots.filter((slot) => slot.includes("FLEX"));

  const used = new Set<string>();
  const lineup: string[] = [];

  for (const slot of [...dedicatedSlots, ...flexSlots]) {
    const eligible = slotEligiblePositions(slot);
    let best: LineupCandidate | null = null;
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

export function toLineupCandidates(
  playerIds: string[],
  positionByPlayerId: Map<string, string>,
  projectedPtsById: Map<string, number>
): LineupCandidate[] {
  return playerIds.flatMap((id) => {
    const position = positionByPlayerId.get(id);
    if (!position) return [];
    return [{ playerId: id, position, projectedPts: projectedPtsById.get(id) ?? 0 }];
  });
}

/**
 * Total projected points of the best lineup fieldable from `playerIds`. This
 * is the quantity a roster override actually changes in
 * lib/playoff-odds.ts's simulation — a team's simMean moves with it and
 * nothing else does — which is what lets the trade finder rank candidates on
 * projected-points delta without running a simulation per candidate.
 */
export function bestLineupPoints(
  startingSlots: string[],
  playerIds: string[],
  positionByPlayerId: Map<string, string>,
  projectedPtsById: Map<string, number>
): number {
  const candidates = toLineupCandidates(playerIds, positionByPlayerId, projectedPtsById);
  const lineup = assignLineup(startingSlots, candidates);
  return lineup.reduce((sum, id) => sum + (projectedPtsById.get(id) ?? 0), 0);
}
