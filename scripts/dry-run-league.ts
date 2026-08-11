// Prints the neutral league shape and playoff odds for any league, whatever
// it's backed by, writing nothing anywhere. Takes an app-level league ID — a
// bare number for Sleeper, or "espn-<season>-<id>" for ESPN.
//
// The point is that the output format is identical for both: this is the
// quickest way to confirm a change to the shared path (lib/league-data.ts,
// lib/playoff-odds.ts) didn't regress one source while fixing the other.
//
// Run: npm run dryrun:league [leagueId]
import { getLeagueData } from "../lib/league-data";
import { formatRecord, managerDisplayName, managerTeamName } from "../lib/league-types";
import { buildLeagueSimContext, simulateSeason } from "../lib/playoff-odds";

const DEFAULT_LEAGUE_ID = "1385091542758203392";

async function main() {
  const leagueId = process.argv[2] ?? DEFAULT_LEAGUE_ID;

  const started = Date.now();
  const { league, rosters, managers } = await getLeagueData(leagueId);
  const fetched = Date.now();

  console.log(`=== ${league.name} (${league.season}) ===`);
  console.log(`leagueId:         ${league.leagueId}`);
  console.log(`totalRosters:     ${league.totalRosters}`);
  console.log(`pprValue:         ${league.pprValue}`);
  console.log(`playoffTeams:     ${league.playoffTeams}`);
  console.log(`playoffWeekStart: ${league.playoffWeekStart}`);
  console.log(`tradeDeadline:    ${league.tradeDeadlineWeek ?? "(not expressed)"}`);
  console.log(`rosterPositions:  ${league.rosterPositions.join(", ")}`);
  console.log(`fetched in ${fetched - started}ms`);

  const managersById = new Map(managers.map((manager) => [manager.ownerId, manager]));
  console.log(`\n${"team".padEnd(26)} ${"manager".padEnd(20)} rec      PF      starters/roster`);
  for (const roster of [...rosters].sort((a, b) => a.rosterId - b.rosterId)) {
    const manager = roster.ownerId ? managersById.get(roster.ownerId) : undefined;
    console.log(
      `${managerTeamName(manager).slice(0, 25).padEnd(26)} ` +
        `${managerDisplayName(manager).slice(0, 19).padEnd(20)} ` +
        `${formatRecord(roster).padEnd(8)} ` +
        `${roster.pointsFor.toFixed(1).padStart(7)} ` +
        `${String(roster.starters.length).padStart(9)}/${roster.players.length}`
    );
  }

  const simStarted = Date.now();
  const context = await buildLeagueSimContext(leagueId);
  const odds = simulateSeason(context);
  console.log(`\n=== PLAYOFF ODDS (${Date.now() - simStarted}ms) ===`);
  console.log(
    `remaining games: ${context.remainingSchedule.length}  ` +
      `playoff spots: ${context.playoffTeamCount}  ` +
      `sum of odds: ${odds.reduce((sum, t) => sum + t.playoffOdds, 0).toFixed(2)}`
  );
  for (const team of odds) {
    console.log(
      `${team.teamName.slice(0, 25).padEnd(26)} ${team.record.padEnd(7)} ` +
        `${(team.playoffOdds * 100).toFixed(1).padStart(5)}%`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
