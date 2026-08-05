import { getManualRosters, getManualTeams } from "./db/manual-leagues";
import { getPlayerValues, type TradeablePlayer } from "./fantasycalc";
import {
  computeManualStandingsRanks,
  formatManualRecord,
  getManualBucket,
} from "./manual-league";
import {
  computeCompositePositionRanks,
  computePositionStrength,
  type TeamContext,
} from "./team-context";

// Manual leagues have no real roster_positions to read a starting format
// from — assumes a standard single-QB format purely to pick FantasyCalc's
// single-QB vs superflex pricing model (buildFantasyCalcUrl's numQbs), not
// anything roster-composition-related (thinPositions/positionStrength are
// computed independently over player IDs, no format assumption needed).
const DEFAULT_ROSTER_POSITIONS = [
  "QB",
  "RB",
  "RB",
  "WR",
  "WR",
  "TE",
  "FLEX",
  "DEF",
  "K",
  "BN",
  "BN",
  "BN",
  "BN",
  "BN",
  "BN",
];
// Fixed rather than the real (changing) team count, so the FantasyCalc
// query/cache key stays stable as teams are added/removed — numTeams only
// calibrates replacement-level value, not critical to get exact here.
const DEFAULT_TOTAL_ROSTERS = 12;

/**
 * Manual-league analog of lib/team-context.ts's getTeamContexts() — same
 * return shape, so the trade page/analyzer need no new types. thinPositions
 * is always empty (no league roster format to compute a league-format-
 * relative bar against); the mindful-position-flags signal (fixed cutoffs,
 * computed from positionStrength) is what manual leagues use instead — see
 * lib/manual-advice-action.ts.
 */
export async function getManualTeamContexts(leagueId: string): Promise<{
  teams: TeamContext[];
  values: TradeablePlayer[];
}> {
  const [manualTeams, rosters, values] = await Promise.all([
    getManualTeams(leagueId),
    getManualRosters(leagueId),
    getPlayerValues({
      totalRosters: DEFAULT_TOTAL_ROSTERS,
      pprValue: 1,
      rosterPositions: DEFAULT_ROSTER_POSITIONS,
    }),
  ]);

  const valuesById = new Map(values.map((player) => [player.sleeperId, player]));
  const compositeRanks = computeCompositePositionRanks(valuesById);
  const rankByTeamId = computeManualStandingsRanks(manualTeams);

  const teams: TeamContext[] = manualTeams.map((team) => {
    const rosterPlayerIds = (rosters.get(team.id) ?? []).filter((id) => valuesById.has(id));

    return {
      rosterId: team.id,
      teamName: team.teamName,
      // No real "owner" concept for a manually-entered team.
      ownerName: "Manual entry",
      record: formatManualRecord(team),
      bucket: getManualBucket(rankByTeamId.get(team.id) ?? manualTeams.length, manualTeams.length),
      thinPositions: [],
      positionStrength: computePositionStrength(rosterPlayerIds, valuesById, compositeRanks),
      rosterPlayerIds,
    };
  });

  return { teams, values };
}
