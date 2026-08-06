import { fetchJson } from "./http";
import { getRecord, getRosters, getTeamName, getUsers } from "./sleeper";

const SLEEPER_BASE = "https://api.sleeper.app/v1";
const PROJECTIONS_BASE = "https://api.sleeper.app/projections/nfl";

const NUM_SIMULATIONS = 10000;
const MAX_REGULAR_SEASON_WEEKS = 18;
// Weight ramps from 0 (pure projection) to 1 (pure actuals) over a team's
// first 6 games, then stays at 1.
const GAMES_TO_FULL_WEIGHT = 6;

// Duplicated from lib/position-baselines.ts's pprValueToFormat() rather
// than imported — that module instantiates a Neon client at load time, and
// nothing importing this file should risk pulling that into a client
// bundle transitively (see lib/team-advice-format.ts's doc comment for the
// exact class of production bug this avoids repeating).
type ScoringFormat = "standard" | "half_ppr" | "ppr";
function scoringFormat(rec: number | undefined): ScoringFormat {
  const value = rec ?? 1;
  if (value <= 0.25) return "standard";
  if (value < 0.75) return "half_ppr";
  return "ppr";
}

// League-wide weekly team-score standard deviation, used for the portion of
// a team's variance not yet backed by its own actual games (blendWeight
// below). Derived from real week-to-week fantasy scoring, not a guess:
// streamed nflverse's 2021-2025 weekly per-player data, took each
// "startable" player-season's (same tier definition production-pace.ts
// already uses for this league's format: QB top-12, RB/WR top-36, TE
// top-24 league-wide) own within-season week-to-week std, pooled those by
// position (averaging variances then sqrt, not averaging std's directly),
// and summed as independent variances across a standard 10-slot lineup
// (QB, RB x2, WR x2, TE, FLEX x2, K, DEF; FLEX approximated as the
// average of RB/WR variance). K/DEF aren't in that offense-only dataset —
// literature-typical defaults (4.5, 6.5) were used for those two slots
// instead of derived ones. Summing as independent variances ignores real
// positive correlation between teammates (shared game script), so if
// anything this slightly *understates* true team variance — deliberately
// not correcting for that without real data to size the correlation, same
// as every other first-pass threshold in this app.
const DEFAULT_STD_DEV_BY_FORMAT: Record<ScoringFormat, number> = {
  standard: 23,
  half_ppr: 24,
  ppr: 26,
};
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

function getLeagueSettings(leagueId: string): Promise<SleeperLeagueSettings> {
  return fetchJson(`${SLEEPER_BASE}/league/${leagueId}`, { next: { revalidate: 3600 } });
}

function getMatchups(leagueId: string, week: number): Promise<SleeperMatchup[]> {
  return fetchJson(`${SLEEPER_BASE}/league/${leagueId}/matchups/${week}`, {
    next: { revalidate: 3600 },
  });
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
  const data = await fetchJson<SleeperProjection[]>(url, { cache: "no-store" });
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

function stdDev(values: number[], fallback: number): number {
  if (values.length < 2) return fallback;
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
  // Scoring mean with no roster override applied — the blend of actuals and
  // the projection of this team's real current starters.
  baseSimMean: number;
  simStd: number;
}

interface ScheduledMatchup {
  week: number;
  rosterIds: [number, number];
}

export interface LeagueSimContext {
  teams: TeamState[];
  remainingSchedule: ScheduledMatchup[];
  playoffTeamCount: number;
  // Projected points of each roster's real current starters, the reference
  // point a roster override is measured against (see simulateSeason).
  baseProjByRoster: Map<number, number>;
  projectedPtsById: Map<string, number>;
  // How much of each team's scoring mean comes from actuals rather than
  // projections — 0 before any games, 1 from six games on.
  actualsWeightByRoster: Map<number, number>;
}

/**
 * Does all the fetching and per-team estimation for a playoff-odds run:
 * blended scoring mean/std, the remaining schedule, and the projection
 * reference points an override is measured against.
 *
 * Split from the simulation itself so a caller evaluating many hypothetical
 * rosters (the trade finder confirming a shortlist) can build this once and
 * then run simulateSeason() per candidate, instead of refetching a league's
 * whole season of matchups for every one.
 */
export async function buildLeagueSimContext(leagueId: string): Promise<LeagueSimContext> {
  const [league, rosters, users] = await Promise.all([
    getLeagueSettings(leagueId),
    getRosters(leagueId),
    getUsers(leagueId),
  ]);

  const defaultStdDev = DEFAULT_STD_DEV_BY_FORMAT[scoringFormat(league.scoring_settings?.rec)];
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

  const baseProjByRoster = new Map<number, number>();
  const actualsWeightByRoster = new Map<number, number>();

  const teams: TeamState[] = rosters.map((roster) => {
    const owner = roster.owner_id ? usersById.get(roster.owner_id) : undefined;
    const actualScores = actualScoresByRoster.get(roster.roster_id) ?? [];
    const gamesPlayed = actualScores.length;
    const weight = blendWeight(gamesPlayed);

    const actualAvg = mean(actualScores);
    const baseProj = projectionAverage(roster.starters);
    baseProjByRoster.set(roster.roster_id, baseProj);
    actualsWeightByRoster.set(roster.roster_id, weight);

    const actualStd = gamesPlayed >= 2 ? stdDev(actualScores, defaultStdDev) : defaultStdDev;
    const simStd = weight * actualStd + (1 - weight) * defaultStdDev;

    const { wins = 0, losses = 0, ties = 0 } = roster.settings ?? {};

    return {
      rosterId: roster.roster_id,
      teamName: getTeamName(owner),
      record: getRecord(roster),
      wins,
      losses,
      ties,
      points: actualScores.reduce((sum, v) => sum + v, 0),
      baseSimMean: weight * actualAvg + (1 - weight) * baseProj,
      simStd,
    };
  });

  return {
    teams,
    remainingSchedule,
    playoffTeamCount,
    baseProjByRoster,
    projectedPtsById: projectionsById,
    actualsWeightByRoster,
  };
}

/**
 * Runs the Monte Carlo season from a prepared context. Pure and synchronous:
 * ~123ms for a 12-team league over 10,000 trials.
 *
 * A roster override is applied as a *delta* on top of the team's blended
 * mean, not as a replacement for its projection term. It used to replace the
 * projection, which meant it was multiplied by (1 - weight) — and weight
 * reaches 1 once a team has played six games. From week 7 of a 14-week
 * season onward, every hypothetical roster therefore scored exactly the same
 * as the real one and every trade evaluated to a 0.0 odds change, across the
 * whole trade-deadline window where the feature actually matters. Measuring
 * the override against the same starters the base mean was built from keeps
 * the actuals-driven level (the trustworthy part of the blend late in a
 * season) while still letting a lineup change move the result.
 */
export function simulateSeason(
  context: LeagueSimContext,
  rosterOverrides?: Map<number, string[]>
): PlayoffOddsResult[] {
  const { teams, remainingSchedule, playoffTeamCount } = context;

  const simMeanByRoster = new Map<number, number>();
  for (const team of teams) {
    const override = rosterOverrides?.get(team.rosterId);
    if (!override) {
      simMeanByRoster.set(team.rosterId, team.baseSimMean);
      continue;
    }
    const overrideProj = override
      .filter((id) => id && id !== "0")
      .reduce((sum, id) => sum + (context.projectedPtsById.get(id) ?? 0), 0);
    const baseProj = context.baseProjByRoster.get(team.rosterId) ?? 0;
    simMeanByRoster.set(team.rosterId, team.baseSimMean + (overrideProj - baseProj));
  }

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

      const scoreA = sampleNormal(simMeanByRoster.get(idA) ?? 0, teamA.simStd);
      const scoreB = sampleNormal(simMeanByRoster.get(idB) ?? 0, teamB.simStd);

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
  const context = await buildLeagueSimContext(leagueId);
  return simulateSeason(context, options?.rosterOverrides);
}
