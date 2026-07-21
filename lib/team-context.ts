import { getPlayerValues, type TradeablePlayer } from "./fantasycalc";
import { getPlayoffOdds } from "./playoff-odds";
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

// First-pass thresholds, not yet calibrated against real mid-season data.
// The only sample run so far (a simulated test league) spread odds roughly
// 17%-91% across 12 teams; these cut points split that spread into thirds.
// Revisit once we have odds from an in-progress real season to check against.
const FAVORITE_ODDS_THRESHOLD = 0.6;
const CONTENDER_ODDS_THRESHOLD = 0.25;

function getPlayoffBucket(playoffOdds: number): PlayoffBucket {
  if (playoffOdds >= FAVORITE_ODDS_THRESHOLD) return "Playoff Favorite";
  if (playoffOdds >= CONTENDER_ODDS_THRESHOLD) return "Playoff Contender";
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
  const [league, rosters, users, values, playoffOdds] = await Promise.all([
    getLeague(),
    getRosters(),
    getUsers(),
    getPlayerValues(),
    getPlayoffOdds(),
  ]);

  const usersById = new Map(users.map((user) => [user.user_id, user]));
  const valuesById = new Map(values.map((player) => [player.sleeperId, player]));
  const oddsByRosterId = new Map(playoffOdds.map((o) => [o.rosterId, o.playoffOdds]));
  const requiredStarters = countStarterSlots(league.roster_positions);

  const teams = rosters.map((roster) => {
    const owner = roster.owner_id ? usersById.get(roster.owner_id) : undefined;
    const rosterPlayerIds = (roster.players ?? []).filter((id) =>
      valuesById.has(id)
    );

    return {
      rosterId: roster.roster_id,
      teamName: getTeamName(owner),
      ownerName: owner?.display_name ?? "Unassigned",
      record: getRecord(roster),
      bucket: getPlayoffBucket(oddsByRosterId.get(roster.roster_id) ?? 0),
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
