"use server";

import {
  assignLineup,
  startingSlotsOf,
  type LineupCandidate,
} from "./lineup";
import { getLeagueData } from "./league-data";
import { getPlayoffOdds } from "./playoff-odds";
import { getCurrentNflWeek, getWeeklyProjectedPoints } from "./projections";
import { getAllPlayers } from "./sleeper";

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
 * TODO (revisit once the season starts, Sept 2026): `before` here is the
 * team's *best-lineup* odds, while the dashboard and /odds pages show
 * getPlayoffOdds() against the manager's *actual* current starters. The two
 * disagree by however much a lineup is off optimal — on the tracked league
 * in the preseason that's 87.5% vs 94.2%, because rosters were freshly
 * drafted and starters were never set by hand.
 *
 * This is deliberate and not a bug: the comparison above has to apply one
 * lineup policy to both sides or it credits the trade for merely re-setting
 * a lineup. But it does mean two surfaces show different "current odds" for
 * the same team. The gap should shrink once managers actually set lineups
 * weekly, so no explainer/tooltip is being built for it now — decide in
 * September, with real usage, whether it needs surfacing in the UI or
 * whether the dashboard should move to best-lineup odds too.
 */
export async function getOddsForTrade(
  leagueId: string,
  rosterId: number,
  giveIds: string[],
  receiveIds: string[]
): Promise<TradeOddsDiff | null> {
  const { league, rosters } = await getLeagueData(leagueId);
  const roster = rosters.find((r) => r.rosterId === rosterId);
  if (!roster) return null;

  const startingSlots = startingSlotsOf(league.rosterPositions);

  const giveSet = new Set(giveIds);
  const currentRosterIds = roster.players;
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
