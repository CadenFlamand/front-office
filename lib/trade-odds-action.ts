"use server";

import {
  assignLineup,
  startingSlotsOf,
  type LineupCandidate,
} from "./lineup";
import { getPlayoffOdds } from "./playoff-odds";
import { getCurrentNflWeek, getWeeklyProjectedPoints } from "./projections";
import { getAllPlayers, getLeague, getRosters } from "./sleeper";

export interface TradeOddsDiff {
  before: number;
  after: number;
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

  const startingSlots = startingSlotsOf(league.roster_positions);

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

  function toCandidates(ids: string[]): LineupCandidate[] {
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
