import type { LeagueRoster } from "./league-types";

export interface StandingsRank {
  recordRank: number;
  pfRank: number;
}

function winPct(roster: LeagueRoster): number {
  const games = roster.wins + roster.losses + roster.ties;
  return games > 0 ? (roster.wins + 0.5 * roster.ties) / games : 0;
}

// Ranks 1 = best. Ties break toward points-for (record rank) or rosterId
// (points-for rank) so the result is deterministic across calls — same
// tiebreak spirit as lib/playoff-odds.ts's simulated standings sort.
export function computeStandingsRanks(rosters: LeagueRoster[]): Map<number, StandingsRank> {
  const byRecord = [...rosters].sort(
    (a, b) => winPct(b) - winPct(a) || b.pointsFor - a.pointsFor || a.rosterId - b.rosterId
  );
  const byPoints = [...rosters].sort(
    (a, b) => b.pointsFor - a.pointsFor || a.rosterId - b.rosterId
  );

  const recordRankById = new Map(byRecord.map((roster, i) => [roster.rosterId, i + 1]));
  const pfRankById = new Map(byPoints.map((roster, i) => [roster.rosterId, i + 1]));

  return new Map(
    rosters.map((roster) => [
      roster.rosterId,
      {
        recordRank: recordRankById.get(roster.rosterId) ?? rosters.length,
        pfRank: pfRankById.get(roster.rosterId) ?? rosters.length,
      },
    ])
  );
}
