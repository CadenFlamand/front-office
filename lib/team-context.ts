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

// Duplicated rather than imported from lib/sleeper.ts so this module never
// depends on (or risks changing) the pages already built on that file —
// same rationale as lib/playoff-odds.ts's own copy of these constants.
const LEAGUE_ID = "1385091542758203392";
const SLEEPER_BASE = "https://api.sleeper.app/v1";

interface SleeperLeagueScoring {
  scoring_settings: { rec?: number } | null;
}

// lib/sleeper.ts's getLeague() doesn't expose scoring_settings, so this
// fetches the same league endpoint again for just that field. Next.js
// dedupes identical fetch()s within a request, so this doesn't cost an
// extra round trip in practice.
async function getLeagueScoring(): Promise<SleeperLeagueScoring> {
  const res = await fetch(`${SLEEPER_BASE}/league/${LEAGUE_ID}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    throw new Error(`Sleeper API request failed (${res.status})`);
  }
  return res.json() as Promise<SleeperLeagueScoring>;
}

const STARTER_POSITIONS = ["QB", "RB", "WR", "TE"] as const;
const STARTER_POSITION_SET = new Set<string>(STARTER_POSITIONS);

function slotEligiblePositions(slot: string): string[] {
  return slot.includes("FLEX") ? ["RB", "WR", "TE"] : [slot];
}

function countStarterSlots(rosterPositions: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const position of STARTER_POSITIONS) counts[position] = 0;

  for (const slot of rosterPositions) {
    // A FLEX-type slot doesn't require a specific position, so it's split
    // proportionally across the positions it's eligible for (RB/WR/TE)
    // rather than counted fully against each — a league with 1 FLEX slot
    // needs "1 more flex-eligible player", not "1 more RB AND 1 more WR
    // AND 1 more TE".
    const eligible = slotEligiblePositions(slot).filter((position) =>
      STARTER_POSITION_SET.has(position)
    );
    if (eligible.length === 0) continue;
    const share = 1 / eligible.length;
    for (const position of eligible) counts[position] += share;
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
  requiredStarters: Record<string, number>,
  totalRosters: number
): string[] {
  // "Startable" = ranked within the league-wide universe of players good
  // enough to fill every team's dedicated slots at that position, where a
  // FLEX-type slot's requirement is split proportionally across the
  // positions it's eligible for (see countStarterSlots) rather than
  // counted fully against each. A player who doesn't even show up in
  // FantasyCalc's valued pool is, by definition, not startable.
  const startableCounts: Record<string, number> = {};
  for (const position of STARTER_POSITIONS) startableCounts[position] = 0;

  for (const playerId of rosterPlayerIds) {
    const player = valuesById.get(playerId);
    if (!player) continue;
    const threshold = requiredStarters[player.position];
    if (threshold === undefined) continue;
    const leagueWideStartableRank = threshold * totalRosters;
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
  const [league, leagueScoring] = await Promise.all([getLeague(), getLeagueScoring()]);

  const [rosters, users, values, playoffOdds] = await Promise.all([
    getRosters(),
    getUsers(),
    getPlayerValues({
      totalRosters: league.total_rosters,
      pprValue: leagueScoring.scoring_settings?.rec,
      rosterPositions: league.roster_positions,
    }),
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
        requiredStarters,
        league.total_rosters
      ),
      rosterPlayerIds,
    };
  });

  return { teams, values };
}
