"use server";

import { getPlayerValues, type TradeablePlayer } from "./fantasycalc";
import { fetchJson } from "./http";
import { bestLineup, startingSlotsOf } from "./lineup";
import { isManualLeagueId } from "./manual-league";
import { buildLeagueSimContext, simulateSeason } from "./playoff-odds";
import { computeLeagueProductionPace } from "./production-pace";
import { getCurrentNflWeek, getWeeklyProjectedPoints } from "./projections";
import { getAllPlayers, getLeague, getRosters, getTeamName, getUsers } from "./sleeper";
import { computeCompositePositionRanks, countStarterSlots } from "./team-context";
import { findTradeCandidates, type FinderTeam, type TradeCandidate } from "./trade-finder";
import { assessWinWin, compareAssessed, type WinWinAssessment } from "./win-win";

const SLEEPER_BASE = "https://api.sleeper.app/v1";

// Stage 1 can hand back more than this, but each survivor costs a full
// ~123ms Monte Carlo run and they're all confirmed inside one request. Twelve
// keeps the on-demand click at roughly 1.5s of simulation.
const MAX_SIMULATED_CANDIDATES = 12;

export interface SuggestedPlayer {
  sleeperId: string;
  name: string;
  position: string;
  team: string | null;
  value: number;
}

export interface WinWinSuggestion {
  partnerRosterId: number;
  partnerTeamName: string;
  give: SuggestedPlayer[];
  receive: SuggestedPlayer[];
  valueDiff: number;
  myOddsBefore: number;
  myOddsAfter: number;
  partnerOddsBefore: number;
  partnerOddsAfter: number;
  assessment: WinWinAssessment;
  // Human-readable "QB weak", "RB thin" etc. that this trade clears.
  myClears: string[];
  partnerClears: string[];
}

interface SleeperLeagueScoring {
  scoring_settings: { rec?: number } | null;
}

function toSuggestedPlayers(
  ids: string[],
  playersById: Map<string, TradeablePlayer>
): SuggestedPlayer[] {
  return ids.flatMap((id) => {
    const player = playersById.get(id);
    if (!player) return [];
    return [
      {
        sleeperId: player.sleeperId,
        name: player.name,
        position: player.position,
        team: player.team,
        value: player.value,
      },
    ];
  });
}

/**
 * The full two-stage win-win engine, run on demand for one team.
 *
 * Stage 1 (lib/trade-finder.ts) enumerates and prunes the league's whole
 * candidate space with no simulation. Stage 2 here confirms the survivors
 * against the real Monte Carlo season, and only trades that qualify under
 * lib/win-win.ts come back.
 *
 * The simulation cost is why Stage 1 exists, and two things keep Stage 2
 * affordable. The league context is built once rather than per candidate.
 * And because getPlayoffOdds returns odds for every team in a single run,
 * overriding both traders' rosters together yields both sides' after-odds
 * from one simulation — so a shortlist of N costs 1 + N runs, not 4N.
 *
 * Every simulation, baseline included, runs against best-available lineups
 * for all twelve teams. Comparing a hypothetical best lineup against a
 * baseline of whatever the managers happen to have set would credit trades
 * for lineups merely being tidied up.
 *
 * Sleeper-only: manual leagues carry no schedule, so there is no season to
 * simulate and this returns nothing for them.
 */
export async function findWinWinTrades(
  leagueId: string,
  rosterId: number
): Promise<WinWinSuggestion[]> {
  if (isManualLeagueId(leagueId)) return [];

  const league = await getLeague(leagueId);
  const [rosters, users, allPlayers, leagueScoring] = await Promise.all([
    getRosters(leagueId),
    getUsers(leagueId),
    getAllPlayers(),
    fetchJson<SleeperLeagueScoring>(`${SLEEPER_BASE}/league/${leagueId}`, {
      next: { revalidate: 3600 },
    }),
  ]);

  const values = await getPlayerValues({
    totalRosters: league.total_rosters,
    pprValue: leagueScoring.scoring_settings?.rec,
    rosterPositions: league.roster_positions,
  });

  const playersById = new Map(values.map((player) => [player.sleeperId, player]));
  const compositeRanks = computeCompositePositionRanks(playersById);
  const requiredStarters = countStarterSlots(league.roster_positions);
  const startingSlots = startingSlotsOf(league.roster_positions);

  const positionByPlayerId = new Map<string, string>();
  for (const [id, player] of Object.entries(allPlayers)) {
    if (player.position) positionByPlayerId.set(id, player.position);
  }

  const currentWeek = await getCurrentNflWeek();
  const [projectedPtsById, leaguePace] = await Promise.all([
    getWeeklyProjectedPoints(league.season, currentWeek),
    computeLeagueProductionPace(leagueId, playersById),
  ]);

  const usersById = new Map(users.map((user) => [user.user_id, user]));
  const teams: FinderTeam[] = rosters.map((roster) => ({
    rosterId: roster.roster_id,
    teamName: getTeamName(roster.owner_id ? usersById.get(roster.owner_id) : undefined),
    valuedPlayerIds: (roster.players ?? []).filter((id) => playersById.has(id)),
    allPlayerIds: (roster.players ?? []).filter((id) => id && id !== "0"),
  }));

  const me = teams.find((team) => team.rosterId === rosterId);
  if (!me) return [];

  const { candidates } = findTradeCandidates({
    me,
    partners: teams.filter((team) => team.rosterId !== rosterId),
    playersById,
    positionByPlayerId,
    projectedPtsById,
    compositeRanks,
    startingSlots,
    requiredStarters,
    totalRosters: league.total_rosters,
    leaguePace,
    limit: MAX_SIMULATED_CANDIDATES,
  });
  if (candidates.length === 0) return [];

  const context = await buildLeagueSimContext(leagueId);

  const lineupFor = (playerIds: string[]) =>
    bestLineup(startingSlots, playerIds, positionByPlayerId, projectedPtsById);

  const baseLineups = new Map(
    teams.map((team) => [team.rosterId, lineupFor(team.allPlayerIds)])
  );
  const rosterIdsByTeam = new Map(teams.map((team) => [team.rosterId, team.allPlayerIds]));

  const baseline = simulateSeason(context, baseLineups);
  const baselineOdds = new Map(baseline.map((team) => [team.rosterId, team.playoffOdds]));

  const suggestions: WinWinSuggestion[] = [];

  for (const candidate of candidates) {
    const partnerIds = rosterIdsByTeam.get(candidate.partnerRosterId);
    if (!partnerIds) continue;

    const given = new Set(candidate.giveIds);
    const received = new Set(candidate.receiveIds);

    const overrides = new Map(baseLineups);
    overrides.set(
      rosterId,
      lineupFor([...me.allPlayerIds.filter((id) => !given.has(id)), ...candidate.receiveIds])
    );
    overrides.set(
      candidate.partnerRosterId,
      lineupFor([...partnerIds.filter((id) => !received.has(id)), ...candidate.giveIds])
    );

    const after = simulateSeason(context, overrides);
    const afterOdds = new Map(after.map((team) => [team.rosterId, team.playoffOdds]));

    const myBefore = baselineOdds.get(rosterId);
    const myAfter = afterOdds.get(rosterId);
    const partnerBefore = baselineOdds.get(candidate.partnerRosterId);
    const partnerAfter = afterOdds.get(candidate.partnerRosterId);
    if (
      myBefore === undefined ||
      myAfter === undefined ||
      partnerBefore === undefined ||
      partnerAfter === undefined
    ) {
      continue;
    }

    const assessment = assessWinWin({
      myOddsDelta: myAfter - myBefore,
      partnerOddsDelta: partnerAfter - partnerBefore,
      valueDiff: candidate.valueDiff,
      myClearsNeed: candidate.myResolvedFlags.length > 0,
      partnerClearsNeed: candidate.partnerResolvedFlags.length > 0,
    });
    if (!assessment) continue;

    suggestions.push({
      partnerRosterId: candidate.partnerRosterId,
      partnerTeamName: candidate.partnerTeamName,
      give: toSuggestedPlayers(candidate.giveIds, playersById),
      receive: toSuggestedPlayers(candidate.receiveIds, playersById),
      valueDiff: candidate.valueDiff,
      myOddsBefore: myBefore,
      myOddsAfter: myAfter,
      partnerOddsBefore: partnerBefore,
      partnerOddsAfter: partnerAfter,
      assessment,
      myClears: describeFlags(candidate, "mine"),
      partnerClears: describeFlags(candidate, "partner"),
    });
  }

  const sortKey = (suggestion: WinWinSuggestion) => ({
    assessment: suggestion.assessment,
    myOddsDelta: suggestion.myOddsAfter - suggestion.myOddsBefore,
  });
  suggestions.sort((a, b) => compareAssessed(sortKey(a), sortKey(b)));
  return suggestions;
}

function describeFlags(candidate: TradeCandidate, side: "mine" | "partner"): string[] {
  const flags = side === "mine" ? candidate.myResolvedFlags : candidate.partnerResolvedFlags;
  return flags.map((flag) => `${flag.position} ${flag.reason}`);
}
