import { getPlayerValues, type TradeablePlayer } from "./fantasycalc";
import { getLeague, getRecord, getRosters, getTeamName, getUsers } from "./sleeper";

export type PlayoffBucket =
  | "Playoff Favorite"
  | "Playoff Contender"
  | "Playoff Hopeful";

export interface TeamContext {
  rosterId: number;
  teamName: string;
  ownerName: string;
  record: string;
  bucket: PlayoffBucket;
  thinPositions: string[];
  // Sleeper IDs of this team's rostered players that also have a FantasyCalc
  // value (i.e. tradeable skill players) — used to scope "You Give" to this
  // team's actual roster instead of the full league player pool.
  rosterPlayerIds: string[];
}

const STARTER_POSITIONS = ["QB", "RB", "WR", "TE"] as const;

function countStarterSlots(rosterPositions: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const position of STARTER_POSITIONS) counts[position] = 0;
  for (const slot of rosterPositions) {
    if (slot in counts) counts[slot] += 1;
  }
  return counts;
}

// This bucketing is a TEMPORARY placeholder for a real playoff-odds
// simulator. It only looks at current win% and ignores schedule, points
// scored, tiebreakers, etc. Replace this once real odds are available.
function getPlayoffBucket(winPct: number): PlayoffBucket {
  if (winPct >= 0.7) return "Playoff Favorite";
  if (winPct >= 0.3) return "Playoff Contender";
  return "Playoff Hopeful";
}

function computeThinPositions(
  rosterPlayerIds: string[],
  valuesById: Map<string, TradeablePlayer>,
  requiredStarters: Record<string, number>
): string[] {
  // "Startable" = ranked within the league-wide universe of players good
  // enough to fill every team's dedicated slots at that position (ignoring
  // FLEX, which can be any position, to keep this simple). A player who
  // doesn't even show up in FantasyCalc's valued pool is, by definition,
  // not startable.
  const startableCounts: Record<string, number> = {};
  for (const position of STARTER_POSITIONS) startableCounts[position] = 0;

  for (const playerId of rosterPlayerIds) {
    const player = valuesById.get(playerId);
    if (!player) continue;
    const threshold = requiredStarters[player.position];
    if (threshold === undefined) continue;
    const leagueWideStartableRank = threshold * 12; // 12 teams in this league
    if (player.positionRank <= leagueWideStartableRank) {
      startableCounts[player.position] += 1;
    }
  }

  return STARTER_POSITIONS.filter(
    (position) => startableCounts[position] < requiredStarters[position]
  );
}

export async function getTeamContexts(): Promise<{
  teams: TeamContext[];
  values: TradeablePlayer[];
}> {
  const [league, rosters, users, values] = await Promise.all([
    getLeague(),
    getRosters(),
    getUsers(),
    getPlayerValues(),
  ]);

  const usersById = new Map(users.map((user) => [user.user_id, user]));
  const valuesById = new Map(values.map((player) => [player.sleeperId, player]));
  const requiredStarters = countStarterSlots(league.roster_positions);

  const teams = rosters.map((roster) => {
    const owner = roster.owner_id ? usersById.get(roster.owner_id) : undefined;
    const { wins = 0, losses = 0, ties = 0 } = roster.settings ?? {};
    const games = wins + losses + ties;
    const winPct = games === 0 ? 0 : (wins + ties * 0.5) / games;
    const rosterPlayerIds = (roster.players ?? []).filter((id) =>
      valuesById.has(id)
    );

    return {
      rosterId: roster.roster_id,
      teamName: getTeamName(owner),
      ownerName: owner?.display_name ?? "Unassigned",
      record: getRecord(roster),
      bucket: getPlayoffBucket(winPct),
      thinPositions: computeThinPositions(
        roster.players ?? [],
        valuesById,
        requiredStarters
      ),
      rosterPlayerIds,
    };
  });

  return { teams, values };
}
