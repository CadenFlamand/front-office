import { getRecord, getRosters, getTeamName, getUsers } from "./sleeper";

const SLEEPER_BASE = "https://api.sleeper.app/v1";
const PROJECTIONS_BASE = "https://api.sleeper.app/projections/nfl";

const NUM_SIMULATIONS = 10000;
const MAX_REGULAR_SEASON_WEEKS = 18;
// Weight ramps from 0 (pure projection) to 1 (pure actuals) over a team's
// first 6 games, then stays at 1.
const GAMES_TO_FULL_WEIGHT = 6;
// Rough league-wide weekly team-score standard deviation for a standard
// fantasy format, used before a team has enough actual games of its own.
const DEFAULT_STD_DEV = 22;
const PROJECTION_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"];

interface SleeperLeagueSettings {
  league_id: string;
  season: string;
  settings: {
    playoff_teams?: number;
    playoff_week_start?: number;
  } | null;
  scoring_settings: { rec?: number } | null;
}

interface SleeperMatchup {
  roster_id: number;
  matchup_id: number | null;
  points: number | null;
  starters: string[] | null;
}

interface SleeperProjection {
  player_id: string;
  stats?: Record<string, number>;
}

export interface PlayoffOddsResult {
  rosterId: number;
  teamName: string;
  record: string;
  playoffOdds: number;
}

export interface GetPlayoffOddsOptions {
  // Keyed by rosterId. When present, used in place of that team's live
  // Sleeper starters when computing the projection-based scoring estimate —
  // lets callers (e.g. the trade analyzer) preview odds under a hypothetical
  // roster without touching real Sleeper data.
  rosterOverrides?: Map<number, string[]>;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) {
    throw new Error(`Request failed (${res.status}): ${url}`);
  }
  return res.json() as Promise<T>;
}

function getLeagueSettings(leagueId: string): Promise<SleeperLeagueSettings> {
  return fetchJson(`${SLEEPER_BASE}/league/${leagueId}`);
}

function getMatchups(leagueId: string, week: number): Promise<SleeperMatchup[]> {
  return fetchJson(`${SLEEPER_BASE}/league/${leagueId}/matchups/${week}`);
}

// The full-league, all-position payload here is a couple MB — over Next's
// 2MB fetch-cache entry limit, same issue lib/sleeper.ts's getAllPlayers()
// has for its ~14MB payload — so unlike the other fetchJson()-based calls
// above, this is cached manually in memory instead of through Next's data
// cache, which was silently failing to cache it at all.
const PROJECTIONS_CACHE_TTL_MS = 60 * 60 * 1000;
const projectionsCache = new Map<
  string,
  { data: SleeperProjection[]; fetchedAt: number }
>();

async function getProjections(season: string, week: number): Promise<SleeperProjection[]> {
  const cacheKey = `${season}:${week}`;
  const cached = projectionsCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < PROJECTIONS_CACHE_TTL_MS) {
    return cached.data;
  }

  const positionParams = PROJECTION_POSITIONS.map((pos) => `position[]=${pos}`).join("&");
  const url = `${PROJECTIONS_BASE}/${season}/${week}?season_type=regular&${positionParams}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Request failed (${res.status}): ${url}`);
  }
  const data = (await res.json()) as SleeperProjection[];
  projectionsCache.set(cacheKey, { data, fetchedAt: Date.now() });
  return data;
}

function projectionField(rec: number | undefined): "pts_ppr" | "pts_half_ppr" | "pts_std" {
  if (rec === 1) return "pts_ppr";
  if (rec === 0.5) return "pts_half_ppr";
  return "pts_std";
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return DEFAULT_STD_DEV;
  const avg = mean(values);
  const variance =
    values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function blendWeight(gamesPlayed: number): number {
  return Math.min(gamesPlayed / GAMES_TO_FULL_WEIGHT, 1);
}

// Box-Muller transform: draws one sample from Normal(mean, std).
function sampleNormal(meanValue: number, std: number): number {
  const u1 = Math.max(Math.random(), Number.EPSILON);
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return meanValue + z * std;
}

interface TeamState {
  rosterId: number;
  teamName: string;
  record: string;
  wins: number;
  losses: number;
  ties: number;
  points: number;
  simMean: number;
  simStd: number;
}

interface ScheduledMatchup {
  week: number;
  rosterIds: [number, number];
}

/**
 * Estimates each team's blended scoring mean/std, determines the remaining
 * schedule, and runs a Monte Carlo simulation of the rest of the regular
 * season to estimate each team's odds of making the playoffs. Pass
 * `rosterOverrides` to preview odds under a hypothetical roster change;
 * omitting it reflects live Sleeper data as-is.
 */
export async function getPlayoffOdds(
  leagueId: string,
  options?: GetPlayoffOddsOptions
): Promise<PlayoffOddsResult[]> {
  const rosterOverrides = options?.rosterOverrides;
  const [league, rosters, users] = await Promise.all([
    getLeagueSettings(leagueId),
    getRosters(leagueId),
    getUsers(leagueId),
  ]);

  const usersById = new Map(users.map((user) => [user.user_id, user]));
  const playoffTeamCount = league.settings?.playoff_teams ?? Math.ceil(rosters.length / 2);
  const regularSeasonWeeks =
    league.settings?.playoff_week_start && league.settings.playoff_week_start > 1
      ? league.settings.playoff_week_start - 1
      : MAX_REGULAR_SEASON_WEEKS;

  const weekNumbers = Array.from({ length: regularSeasonWeeks }, (_, i) => i + 1);
  const matchupsByWeek = await Promise.all(
    weekNumbers.map((week) => getMatchups(leagueId, week))
  );

  const actualScoresByRoster = new Map<number, number[]>();
  for (const roster of rosters) actualScoresByRoster.set(roster.roster_id, []);

  const remainingSchedule: ScheduledMatchup[] = [];

  weekNumbers.forEach((week, i) => {
    const weekMatchups = matchupsByWeek[i];
    const wasPlayed =
      weekMatchups.length > 0 && weekMatchups.some((m) => (m.points ?? 0) > 0);

    if (wasPlayed) {
      for (const m of weekMatchups) {
        actualScoresByRoster.get(m.roster_id)?.push(m.points ?? 0);
      }
      return;
    }

    const byMatchupId = new Map<number, number[]>();
    for (const m of weekMatchups) {
      if (m.matchup_id === null) continue;
      const group = byMatchupId.get(m.matchup_id) ?? [];
      group.push(m.roster_id);
      byMatchupId.set(m.matchup_id, group);
    }
    for (const group of byMatchupId.values()) {
      if (group.length === 2) {
        remainingSchedule.push({ week, rosterIds: [group[0], group[1]] });
      }
    }
  });

  const nextRemainingWeek = remainingSchedule.reduce<number | null>(
    (min, m) => (min === null || m.week < min ? m.week : min),
    null
  );

  let projectionsById: Map<string, number> = new Map();
  if (nextRemainingWeek !== null) {
    const field = projectionField(league.scoring_settings?.rec);
    try {
      const projections = await getProjections(league.season, nextRemainingWeek);
      projectionsById = new Map(
        projections.map((p) => [p.player_id, p.stats?.[field] ?? 0])
      );
    } catch {
      // Projections unavailable (e.g. week/season out of coverage) — fall
      // back to actuals-only estimates below.
      projectionsById = new Map();
    }
  }

  function projectionAverage(starters: string[] | null | undefined): number {
    const filtered = (starters ?? []).filter((id) => id && id !== "0");
    if (filtered.length === 0) return 0;
    return filtered.reduce((sum, id) => sum + (projectionsById.get(id) ?? 0), 0);
  }

  const teams: TeamState[] = rosters.map((roster) => {
    const owner = roster.owner_id ? usersById.get(roster.owner_id) : undefined;
    const actualScores = actualScoresByRoster.get(roster.roster_id) ?? [];
    const gamesPlayed = actualScores.length;
    const weight = blendWeight(gamesPlayed);

    const actualAvg = mean(actualScores);
    const starters = rosterOverrides?.get(roster.roster_id) ?? roster.starters;
    const projAvg = projectionAverage(starters);
    const simMean = weight * actualAvg + (1 - weight) * projAvg;

    const actualStd = gamesPlayed >= 2 ? stdDev(actualScores) : DEFAULT_STD_DEV;
    const simStd = weight * actualStd + (1 - weight) * DEFAULT_STD_DEV;

    const { wins = 0, losses = 0, ties = 0 } = roster.settings ?? {};

    return {
      rosterId: roster.roster_id,
      teamName: getTeamName(owner),
      record: getRecord(roster),
      wins,
      losses,
      ties,
      points: actualScores.reduce((sum, v) => sum + v, 0),
      simMean,
      simStd,
    };
  });

  const teamsById = new Map(teams.map((t) => [t.rosterId, t]));
  const playoffCounts = new Map<number, number>();
  for (const team of teams) playoffCounts.set(team.rosterId, 0);

  for (let sim = 0; sim < NUM_SIMULATIONS; sim++) {
    const simWins = new Map<number, number>();
    const simTies = new Map<number, number>();
    const simPoints = new Map<number, number>();
    for (const team of teams) {
      simWins.set(team.rosterId, team.wins);
      simTies.set(team.rosterId, team.ties);
      simPoints.set(team.rosterId, team.points);
    }

    for (const matchup of remainingSchedule) {
      const [idA, idB] = matchup.rosterIds;
      const teamA = teamsById.get(idA);
      const teamB = teamsById.get(idB);
      if (!teamA || !teamB) continue;

      const scoreA = sampleNormal(teamA.simMean, teamA.simStd);
      const scoreB = sampleNormal(teamB.simMean, teamB.simStd);

      simPoints.set(idA, (simPoints.get(idA) ?? 0) + scoreA);
      simPoints.set(idB, (simPoints.get(idB) ?? 0) + scoreB);

      if (scoreA > scoreB) {
        simWins.set(idA, (simWins.get(idA) ?? 0) + 1);
      } else if (scoreB > scoreA) {
        simWins.set(idB, (simWins.get(idB) ?? 0) + 1);
      } else {
        simTies.set(idA, (simTies.get(idA) ?? 0) + 1);
        simTies.set(idB, (simTies.get(idB) ?? 0) + 1);
      }
    }

    const standings = teams
      .map((team) => ({
        rosterId: team.rosterId,
        winPct:
          (simWins.get(team.rosterId) ?? 0) + 0.5 * (simTies.get(team.rosterId) ?? 0),
        points: simPoints.get(team.rosterId) ?? 0,
      }))
      .sort((a, b) => b.winPct - a.winPct || b.points - a.points);

    for (const team of standings.slice(0, playoffTeamCount)) {
      playoffCounts.set(team.rosterId, (playoffCounts.get(team.rosterId) ?? 0) + 1);
    }
  }

  return teams
    .map((team) => ({
      rosterId: team.rosterId,
      teamName: team.teamName,
      record: team.record,
      playoffOdds: (playoffCounts.get(team.rosterId) ?? 0) / NUM_SIMULATIONS,
    }))
    .sort((a, b) => b.playoffOdds - a.playoffOdds);
}
