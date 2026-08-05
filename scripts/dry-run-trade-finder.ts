// Stage 1 of the win-win trade engine, run against a real league with no
// simulation and nothing written anywhere — the point is to eyeball whether
// the shortlist it produces is sensible before Stage 2 spends ~123ms of
// Monte Carlo per candidate confirming it.
//
// Prints every team's need/surplus read, the funnel counts at each pruning
// step, and per candidate: the players involved, the value gap, the
// projected lineup-points delta for both sides, and which weak/thin flags
// each side actually clears (the needs-based win-win signal, which unlike
// the odds-based one is fully testable before any games are played).
//
// Run: npm run dryrun:trade-finder [leagueId] [teamName]
import { getPlayerValues, type TradeablePlayer } from "../lib/fantasycalc";
import { getCurrentNflWeek, getWeeklyProjectedPoints } from "../lib/projections";
import { computeLeagueProductionPace } from "../lib/production-pace";
import { startingSlotsOf } from "../lib/lineup";
import { getAllPlayers, getLeague, getRosters, getTeamName, getUsers } from "../lib/sleeper";
import {
  computeCompositePositionRanks,
  countStarterSlots,
  type WeakPositionFlag,
} from "../lib/team-context";
import {
  computeRosterFit,
  findTradeCandidates,
  type FinderTeam,
  type TradeCandidate,
} from "../lib/trade-finder";

const DEFAULT_LEAGUE_ID = "1385091542758203392";
const DEFAULT_TEAM = "fluhmond";

const leagueId = process.argv[2] ?? DEFAULT_LEAGUE_ID;
const teamQuery = process.argv[3] ?? DEFAULT_TEAM;

function flagLabel(flag: WeakPositionFlag): string {
  const source = !flag.flaggedByRank
    ? "production only"
    : flag.backedByProduction
      ? "rank + production"
      : "rank";
  return `${flag.position} ${flag.reason} (${source})`;
}

function describe(ids: string[], playersById: Map<string, TradeablePlayer>): string {
  return ids
    .map((id) => {
      const player = playersById.get(id);
      return player ? `${player.name} [${player.position} ${player.value}]` : id;
    })
    .join(" + ");
}

function shape(candidate: TradeCandidate): string {
  return `${candidate.giveIds.length}-for-${candidate.receiveIds.length}`;
}

async function main() {
  console.log(`league ${leagueId}\n`);

  const league = await getLeague(leagueId);
  const [rosters, users, allPlayers] = await Promise.all([
    getRosters(leagueId),
    getUsers(leagueId),
    getAllPlayers(),
  ]);

  const leagueDetail = (await (
    await fetch(`https://api.sleeper.app/v1/league/${leagueId}`)
  ).json()) as { scoring_settings: { rec?: number } | null };

  const values = await getPlayerValues({
    totalRosters: league.total_rosters,
    pprValue: leagueDetail.scoring_settings?.rec,
    rosterPositions: league.roster_positions,
  });

  const playersById = new Map(values.map((p) => [p.sleeperId, p]));
  const compositeRanks = computeCompositePositionRanks(playersById);
  const requiredStarters = countStarterSlots(league.roster_positions);
  const startingSlots = startingSlotsOf(league.roster_positions);

  const positionByPlayerId = new Map<string, string>();
  for (const [id, player] of Object.entries(allPlayers)) {
    if (player.position) positionByPlayerId.set(id, player.position);
  }

  const currentWeek = await getCurrentNflWeek();
  const projectedPtsById = await getWeeklyProjectedPoints(league.season, currentWeek);
  const leaguePace = await computeLeagueProductionPace(leagueId, playersById);

  const usersById = new Map(users.map((u) => [u.user_id, u]));
  const teams: FinderTeam[] = rosters.map((roster) => ({
    rosterId: roster.roster_id,
    teamName: getTeamName(roster.owner_id ? usersById.get(roster.owner_id) : undefined),
    valuedPlayerIds: (roster.players ?? []).filter((id) => playersById.has(id)),
    allPlayerIds: (roster.players ?? []).filter((id) => id && id !== "0"),
  }));

  const nonZeroProjections = [...projectedPtsById.values()].filter((v) => v > 0).length;
  console.log(
    `week ${currentWeek} projections: ${nonZeroProjections} players with points ` +
      `(${projectedPtsById.size} total)`
  );
  console.log(
    `production pace: ${leaguePace.completedWeeks} completed weeks, ` +
      `${leaguePace.paceByPlayer.size} players scored, ` +
      `${leaguePace.baselineByPosition.size} positions with a baseline` +
      (leaguePace.paceByPlayer.size === 0 ? "  (no signal yet — expected preseason)" : "")
  );
  console.log(`starting slots: ${startingSlots.join(", ")}`);
  console.log(
    `required starters: ${Object.entries(requiredStarters)
      .map(([p, n]) => `${p} ${n}`)
      .join(", ")}\n`
  );

  // ---- every team's need/surplus read -------------------------------------
  console.log("=".repeat(96));
  console.log("ROSTER FIT (need = weak/thin flags, surplus = more startable than the lineup needs)");
  console.log("=".repeat(96));
  for (const team of teams) {
    const fit = computeRosterFit(
      team,
      playersById,
      compositeRanks,
      requiredStarters,
      league.total_rosters,
      leaguePace
    );
    const needs = fit.needs.length > 0 ? fit.needs.map(flagLabel).join(", ") : "none";
    const surplus = fit.surplusPositions.size > 0 ? [...fit.surplusPositions].join("/") : "none";
    console.log(`\n  ${team.teamName}  (roster ${team.rosterId})`);
    console.log(`    needs:   ${needs}`);
    console.log(`    surplus: ${surplus}`);
  }

  // Most teams in a partly-unclaimed league share the name "Unassigned Team",
  // so a numeric argument selects by roster ID instead.
  const asRosterId = Number(teamQuery);
  const me = Number.isInteger(asRosterId)
    ? teams.find((t) => t.rosterId === asRosterId)
    : teams.find((t) => t.teamName.toLowerCase().includes(teamQuery.toLowerCase()));
  if (!me) {
    console.error(`\nNo team matching "${teamQuery}".`);
    process.exit(1);
  }
  const partners = teams.filter((t) => t.rosterId !== me.rosterId);

  const started = Date.now();
  const result = findTradeCandidates({
    me,
    partners,
    playersById,
    positionByPlayerId,
    projectedPtsById,
    compositeRanks,
    startingSlots,
    requiredStarters,
    totalRosters: league.total_rosters,
    leaguePace,
  });
  const elapsed = Date.now() - started;

  // ---- funnel -------------------------------------------------------------
  const s = result.stats;
  console.log("\n" + "=".repeat(96));
  console.log(`FUNNEL for ${me.teamName}   (${elapsed}ms, no simulation)`);
  console.log("=".repeat(96));
  console.log(`  partners considered:      ${s.partnersConsidered}`);
  console.log(`  partners complementary:   ${s.partnersComplementary}`);
  console.log(`  shapes enumerated:        ${s.shapesEnumerated}`);
  console.log(`  passed value band:        ${s.passedValueBand}`);
  console.log(`  passed tier gates:        ${s.passedTierGates}`);
  console.log(`  returned (after caps):    ${s.returned}`);

  console.log(`\n  my needs:   ${result.myFit.needs.map(flagLabel).join(", ") || "none"}`);
  console.log(`  my surplus: ${[...result.myFit.surplusPositions].join("/") || "none"}`);

  // ---- candidates ---------------------------------------------------------
  console.log("\n" + "=".repeat(96));
  console.log("SHORTLIST");
  console.log("=".repeat(96));
  if (result.candidates.length === 0) {
    console.log("\n  (none)");
  }
  result.candidates.forEach((c, i) => {
    console.log(`\n${(i + 1).toString().padStart(2)}. [${c.tier}] ${shape(c)} with ${c.partnerTeamName} (roster ${c.partnerRosterId})`);
    console.log(`    you give:    ${describe(c.giveIds, playersById)}`);
    console.log(`    you receive: ${describe(c.receiveIds, playersById)}`);
    console.log(
      `    value:       ${c.valueDiff >= 0 ? "+" : ""}${c.valueDiff} to you` +
        `   |   lineup pts: you ${c.myPointsDelta >= 0 ? "+" : ""}${c.myPointsDelta.toFixed(2)}, ` +
        `them ${c.partnerPointsDelta >= 0 ? "+" : ""}${c.partnerPointsDelta.toFixed(2)}`
    );
    console.log(
      `    you clear:   ${c.myResolvedFlags.map(flagLabel).join(", ") || "—"}`
    );
    console.log(
      `    they clear:  ${c.partnerResolvedFlags.map(flagLabel).join(", ") || "—"}`
    );
  });

  // ---- assertions ---------------------------------------------------------
  console.log("\n" + "=".repeat(96));
  console.log("ASSERTIONS");
  console.log("=".repeat(96));

  const myIds = new Set(me.valuedPlayerIds);
  const rosterById = new Map(teams.map((t) => [t.rosterId, new Set(t.valuedPlayerIds)]));
  const failures: string[] = [];

  for (const [i, c] of result.candidates.entries()) {
    const tag = `#${i + 1}`;
    for (const id of c.giveIds) {
      if (!myIds.has(id)) failures.push(`${tag}: gives ${id}, not on your roster`);
    }
    for (const id of c.receiveIds) {
      if (!rosterById.get(c.partnerRosterId)?.has(id)) {
        failures.push(`${tag}: receives ${id}, not on partner ${c.partnerRosterId}'s roster`);
      }
    }
    const all = [...c.giveIds, ...c.receiveIds];
    if (new Set(all).size !== all.length) failures.push(`${tag}: duplicate player in trade`);
    if (Math.abs(c.valueDiff) >= 4000) failures.push(`${tag}: value gap ${c.valueDiff} outside band`);
    if (c.tier === "both" || c.tier === "odds") {
      if (c.myPointsDelta < 1 || c.partnerPointsDelta < 1) {
        failures.push(`${tag}: tier ${c.tier} but a side doesn't gain lineup points`);
      }
    }
    if (c.tier === "both" || c.tier === "needs") {
      if (c.myResolvedFlags.length === 0 || c.partnerResolvedFlags.length === 0) {
        failures.push(`${tag}: tier ${c.tier} but a side clears no flag`);
      }
    }
    if (c.tier === "needs" && (c.myPointsDelta <= -1 || c.partnerPointsDelta <= -1)) {
      failures.push(`${tag}: needs-tier candidate materially hurts a lineup`);
    }
  }

  const tiers = result.candidates.map((c) => c.tier);
  const rank = { both: 0, odds: 1, needs: 2 };
  for (let i = 1; i < tiers.length; i++) {
    if (rank[tiers[i]] < rank[tiers[i - 1]]) failures.push(`ordering: tier regression at #${i + 1}`);
  }

  const perPartner = new Map<number, number>();
  for (const c of result.candidates) {
    perPartner.set(c.partnerRosterId, (perPartner.get(c.partnerRosterId) ?? 0) + 1);
  }
  for (const [rosterId, count] of perPartner) {
    if (count > 3) failures.push(`diversity: ${count} candidates with partner ${rosterId}`);
  }

  const checks = [
    "give players are on your roster",
    "receive players are on the named partner's roster",
    "no player appears on both sides",
    "value gap within band",
    "odds-tier candidates gain lineup points on both sides",
    "needs-tier candidates clear a flag on both sides",
    "needs-tier candidates don't materially hurt a lineup",
    "shortlist ordered by tier",
    "per-partner diversity cap respected",
  ];
  for (const check of checks) console.log(`  · ${check}`);

  if (failures.length > 0) {
    console.log(`\n  ✗ ${failures.length} FAILURE(S):`);
    for (const f of failures) console.log(`      ${f}`);
    process.exit(1);
  }
  console.log(`\n  ✓ all passed over ${result.candidates.length} candidate(s)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
