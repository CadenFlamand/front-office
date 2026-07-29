import type { SleeperRoster } from "./sleeper";

export interface StandingsRank {
  recordRank: number;
  pfRank: number;
}

function winPct(roster: SleeperRoster): number {
  const { wins = 0, losses = 0, ties = 0 } = roster.settings ?? {};
  const games = wins + losses + ties;
  return games > 0 ? (wins + 0.5 * ties) / games : 0;
}

function pointsFor(roster: SleeperRoster): number {
  const { fpts = 0, fpts_decimal = 0 } = roster.settings ?? {};
  return fpts + fpts_decimal / 100;
}

// Ranks 1 = best. Ties break toward points-for (record rank) or roster_id
// (points-for rank) so the result is deterministic across calls — same
// tiebreak spirit as lib/playoff-odds.ts's simulated standings sort.
export function computeStandingsRanks(rosters: SleeperRoster[]): Map<number, StandingsRank> {
  const byRecord = [...rosters].sort(
    (a, b) => winPct(b) - winPct(a) || pointsFor(b) - pointsFor(a) || a.roster_id - b.roster_id
  );
  const byPoints = [...rosters].sort(
    (a, b) => pointsFor(b) - pointsFor(a) || a.roster_id - b.roster_id
  );

  const recordRankById = new Map(byRecord.map((roster, i) => [roster.roster_id, i + 1]));
  const pfRankById = new Map(byPoints.map((roster, i) => [roster.roster_id, i + 1]));

  return new Map(
    rosters.map((roster) => [
      roster.roster_id,
      {
        recordRank: recordRankById.get(roster.roster_id) ?? rosters.length,
        pfRank: pfRankById.get(roster.roster_id) ?? rosters.length,
      },
    ])
  );
}
