import { getEspnLeagueData } from "./espn/adapter";
import { isEspnLeagueId, parseEspnLeagueId } from "./espn-league";
import type { LeagueData, LeagueInfo, LeagueManager, LeagueRoster } from "./league-types";
import { isManualLeagueId } from "./manual-league";
import {
  getAvatarUrl,
  getLeague,
  getPointsAgainst,
  getPointsFor,
  getRosters,
  getTeamName,
  getUsers,
  type SleeperLeague,
  type SleeperRoster,
} from "./sleeper";

/**
 * The single entry point for reading a league, whatever it's backed by.
 *
 * Dispatches on the league ID's prefix, exactly as isManualLeagueId() already
 * does throughout the app — no extra DB round trip just to learn which data
 * path to take.
 */

// Sleeper leagues with no explicit playoff start run the full regular season;
// 18 is the NFL's regular-season length and the same bound lib/playoff-odds.ts
// used before this module existed.
const MAX_REGULAR_SEASON_WEEKS = 18;

function sleeperLeagueInfo(league: SleeperLeague, rosterCount: number): LeagueInfo {
  return {
    leagueId: league.league_id,
    name: league.name,
    season: league.season,
    totalRosters: league.total_rosters,
    rosterPositions: league.roster_positions,
    pprValue: league.scoring_settings?.rec,
    // A league that hasn't configured a playoff field gets half the field,
    // rounded up — preserving the fallback the odds engine has always used.
    playoffTeams: league.settings?.playoff_teams ?? Math.ceil(rosterCount / 2),
    playoffWeekStart:
      league.settings?.playoff_week_start && league.settings.playoff_week_start > 1
        ? league.settings.playoff_week_start
        : MAX_REGULAR_SEASON_WEEKS + 1,
    // Sleeper leaves this unset on leagues that disable trading and on older
    // seasons; undefined means "no deadline expressed", which the consumer
    // turns into its own default.
    tradeDeadlineWeek:
      league.settings?.trade_deadline && league.settings.trade_deadline > 0
        ? league.settings.trade_deadline
        : undefined,
  };
}

function sleeperRoster(roster: SleeperRoster): LeagueRoster {
  const { wins = 0, losses = 0, ties = 0 } = roster.settings ?? {};
  return {
    rosterId: roster.roster_id,
    ownerId: roster.owner_id,
    players: roster.players ?? [],
    // Sleeper pads unfilled lineup slots with "0" rather than omitting them;
    // stripped here so consumers never have to know that.
    starters: (roster.starters ?? []).filter((id) => id && id !== "0"),
    wins,
    losses,
    ties,
    pointsFor: getPointsFor(roster),
    pointsAgainst: getPointsAgainst(roster),
  };
}

async function getSleeperLeagueData(leagueId: string): Promise<LeagueData> {
  const [league, rosters, users] = await Promise.all([
    getLeague(leagueId),
    getRosters(leagueId),
    getUsers(leagueId),
  ]);

  const managers: LeagueManager[] = users.map((user) => ({
    ownerId: user.user_id,
    displayName: user.display_name,
    teamName: getTeamName(user),
    avatarUrl: getAvatarUrl(user.avatar),
  }));

  return {
    league: sleeperLeagueInfo(league, rosters.length),
    rosters: rosters.map(sleeperRoster),
    managers,
  };
}

export async function getLeagueData(leagueId: string): Promise<LeagueData> {
  if (isEspnLeagueId(leagueId)) {
    const ref = parseEspnLeagueId(leagueId);
    // Unreachable — isEspnLeagueId() is defined as "parses cleanly" — but
    // narrowing beats a non-null assertion.
    if (!ref) throw new Error(`Malformed ESPN league id: ${leagueId}`);
    return getEspnLeagueData(leagueId, ref);
  }

  // Manual leagues deliberately don't route through here. They have no
  // schedule, scoring or roster format to map, and they already run their own
  // parallel path (lib/manual-team-context.ts and friends) with the reduced
  // functionality that implies. Every caller checks isManualLeagueId() and
  // branches before reaching this point; this throw exists so that if one ever
  // stops doing so it fails loudly instead of being handed a Sleeper request
  // for a "manual-<uuid>" ID.
  if (isManualLeagueId(leagueId)) {
    throw new Error(`Manual leagues have no league-data provider: ${leagueId}`);
  }

  return getSleeperLeagueData(leagueId);
}
