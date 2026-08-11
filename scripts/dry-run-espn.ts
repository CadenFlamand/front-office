// Runs the ESPN ingestion path against a real public league and prints what
// came back, writing nothing anywhere. Its main job is the player-resolution
// rate: ESPN's API is unofficial and can change without warning, so this is
// the baseline to re-run when something looks off, and the number to compare
// against.
//
// Run: npm run dryrun:espn [espnLeagueId] [season]
import { parseEspnLeagueId, formatEspnLeagueId } from "../lib/espn-league";
import { fetchEspnLeague } from "../lib/espn/client";
import {
  getSleeperResolutionIndex,
  resolveEspnPlayers,
  resolutionRate,
  HEALTHY_RESOLUTION_RATE,
} from "../lib/espn/player-map";
import type { EspnPlayer } from "../lib/espn/types";
import { isNotFound, isUnauthorized } from "../lib/http";
import { getLeagueData } from "../lib/league-data";
import { formatRecord, managerDisplayName, managerTeamName } from "../lib/league-types";
import { buildLeagueSimContext, simulateSeason } from "../lib/playoff-odds";

// "The Keeper League" — a real 10-team public league, the one ESPN support was
// developed and measured against.
const DEFAULT_ESPN_LEAGUE_ID = "1241838";
const DEFAULT_SEASON = 2025;

async function main() {
  const espnLeagueId = process.argv[2] ?? DEFAULT_ESPN_LEAGUE_ID;
  const season = Number(process.argv[3] ?? DEFAULT_SEASON);
  const leagueId = formatEspnLeagueId(season, espnLeagueId);

  const ref = parseEspnLeagueId(leagueId);
  if (!ref) throw new Error(`Not a valid ESPN league id: ${leagueId}`);

  console.log(`Fetching ${leagueId} …`);
  let league;
  try {
    league = await fetchEspnLeague(ref);
  } catch (error) {
    if (isUnauthorized(error)) throw new Error("That ESPN league is private.");
    if (isNotFound(error)) throw new Error("No ESPN league with that ID for that season.");
    throw error;
  }

  const settings = league.settings;
  console.log(`\n=== ${settings?.name ?? "(unnamed)"} (${league.seasonId}) ===`);
  console.log(`public: ${settings?.isPublic}  teams: ${settings?.size}`);
  console.log(`lineupSlotCounts: ${JSON.stringify(settings?.rosterSettings?.lineupSlotCounts)}`);
  console.log(
    `matchupPeriodCount: ${settings?.scheduleSettings?.matchupPeriodCount}  ` +
      `playoffTeamCount: ${settings?.scheduleSettings?.playoffTeamCount}`
  );
  console.log(
    `scoringPeriodId: ${league.scoringPeriodId}  ` +
      `currentMatchupPeriod: ${league.status?.currentMatchupPeriod}`
  );
  console.log(`schedule games: ${league.schedule?.length ?? 0}`);

  const espnPlayers: EspnPlayer[] = [];
  for (const team of league.teams ?? []) {
    for (const entry of team.roster?.entries ?? []) {
      const player = entry.playerPoolEntry?.player;
      if (player) espnPlayers.push(player);
    }
  }

  console.log(`\nResolving ${espnPlayers.length} rostered players …`);
  const index = await getSleeperResolutionIndex();
  const resolution = resolveEspnPlayers(index, espnPlayers);
  const rate = resolutionRate(resolution);

  console.log(`\n=== PLAYER RESOLUTION ===`);
  console.log(`resolved: ${resolution.resolved}/${resolution.total} (${(rate * 100).toFixed(2)}%)`);
  console.log(`  by name:            ${resolution.methodCounts.name}`);
  console.log(`  by D/ST table:      ${resolution.methodCounts["dst-table"]}`);
  console.log(`  by espn_id tiebreak:${resolution.methodCounts["espn-id-tiebreak"]}`);
  console.log(
    `health floor: ${(HEALTHY_RESOLUTION_RATE * 100).toFixed(0)}%  ` +
      `-> ${rate >= HEALTHY_RESOLUTION_RATE ? "OK" : "BELOW FLOOR"}`
  );

  if (resolution.unresolved.length > 0) {
    console.log(`\nunresolved (${resolution.unresolved.length}):`);
    for (const player of resolution.unresolved) {
      console.log(
        `  ${(player.position ?? "?").padEnd(3)} ${player.name.padEnd(26)} ` +
          `${(player.team ?? "--").padEnd(4)} espnId=${player.espnId}  ${player.reason}`
      );
    }
  }

  // Everything above is ESPN's own shape; everything below is what the rest of
  // the app will actually see.
  const data = await getLeagueData(leagueId);
  console.log(`\n=== NEUTRAL SHAPE (what the app sees) ===`);
  console.log(`name:             ${data.league.name}`);
  console.log(`season:           ${data.league.season}`);
  console.log(`totalRosters:     ${data.league.totalRosters}`);
  console.log(`pprValue:         ${data.league.pprValue}`);
  console.log(`playoffTeams:     ${data.league.playoffTeams}`);
  console.log(`playoffWeekStart: ${data.league.playoffWeekStart}`);
  console.log(`rosterPositions:  ${data.league.rosterPositions.join(", ")}`);

  const managersById = new Map(data.managers.map((manager) => [manager.ownerId, manager]));
  console.log(`\n${"team".padEnd(26)} ${"manager".padEnd(20)} rec      PF      starters/roster`);
  for (const roster of [...data.rosters].sort((a, b) => a.rosterId - b.rosterId)) {
    const manager = roster.ownerId ? managersById.get(roster.ownerId) : undefined;
    console.log(
      `${managerTeamName(manager).slice(0, 25).padEnd(26)} ` +
        `${managerDisplayName(manager).slice(0, 19).padEnd(20)} ` +
        `${formatRecord(roster).padEnd(8)} ` +
        `${roster.pointsFor.toFixed(1).padStart(7)} ` +
        `${String(roster.starters.length).padStart(9)}/${roster.players.length}`
    );
  }

  // The full Monte Carlo path, unchanged from the Sleeper one below
  // assembleSimContext() — if this produces sane odds, every feature built on
  // playoff odds (trade analyzer, co-manager advice, the trade finder) works
  // for ESPN leagues too.
  const started = Date.now();
  const context = await buildLeagueSimContext(leagueId);
  const odds = simulateSeason(context);
  const elapsed = Date.now() - started;

  console.log(`\n=== PLAYOFF ODDS (${elapsed}ms) ===`);
  console.log(
    `remaining games: ${context.remainingSchedule.length}  ` +
      `playoff spots: ${context.playoffTeamCount}`
  );
  const totalOdds = odds.reduce((sum, team) => sum + team.playoffOdds, 0);
  console.log(
    `sum of odds: ${totalOdds.toFixed(2)} (should equal playoff spots: ${context.playoffTeamCount})`
  );
  console.log();
  for (const team of odds) {
    const state = context.teams.find((t) => t.rosterId === team.rosterId);
    console.log(
      `${team.teamName.slice(0, 25).padEnd(26)} ${team.record.padEnd(7)} ` +
        `odds ${(team.playoffOdds * 100).toFixed(1).padStart(5)}%  ` +
        `mean ${(state?.baseSimMean ?? 0).toFixed(1).padStart(6)}  ` +
        `std ${(state?.simStd ?? 0).toFixed(1).padStart(5)}`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
