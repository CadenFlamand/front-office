"use server";

import { getPlayoffOdds } from "./playoff-odds";
import { getRosters } from "./sleeper";

export interface TradeOddsDiff {
  before: number;
  after: number;
}

/**
 * Compares a team's playoff odds today against a hypothetical odds run
 * where `giveIds` are removed from its starters and `receiveIds` are added,
 * so the trade analyzer can preview a trade's playoff impact without
 * mutating any real Sleeper data.
 */
export async function getOddsForTrade(
  rosterId: number,
  giveIds: string[],
  receiveIds: string[]
): Promise<TradeOddsDiff | null> {
  const rosters = await getRosters();
  const roster = rosters.find((r) => r.roster_id === rosterId);
  if (!roster) return null;

  const giveSet = new Set(giveIds);
  const hypotheticalStarters = (roster.starters ?? [])
    .filter((id) => !giveSet.has(id))
    .concat(receiveIds);

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
