"use server";

import { getDefenseRankings } from "./defense-rankings";
import { getPlayerValues } from "./fantasycalc";
import { fetchJson } from "./http";
import { getTeamOpponents } from "./nfl-schedule";
import { getLeague, getRosters } from "./sleeper";
import { computePlayerSos, NEAR_TERM_WINDOW_WEEKS, type PlayerSos } from "./sos";

const SLEEPER_BASE = "https://api.sleeper.app/v1";
const NFL_STATE_URL = `${SLEEPER_BASE}/state/nfl`;

// Duplicated per this codebase's established per-module independence
// convention (see the identical comment on lib/team-context.ts's own copy).
interface SleeperLeagueScoring {
  scoring_settings: { rec?: number } | null;
}
function getLeagueScoring(leagueId: string): Promise<SleeperLeagueScoring> {
  return fetchJson(`${SLEEPER_BASE}/league/${leagueId}`, { next: { revalidate: 3600 } });
}

// Sleeper doesn't set this for every league; fall back to a common default
// rather than leaving the season-long window open-ended — same fallback
// pattern as lib/team-advice-action.ts's DEFAULT_TRADE_DEADLINE_WEEK.
const PLAYOFF_WEEKS_LENGTH = 3;
const DEFAULT_PLAYOFF_END_WEEK = 17;

interface SleeperLeagueSettings {
  settings: { playoff_week_start?: number } | null;
}

async function getPlayoffEndWeek(leagueId: string): Promise<number> {
  const league = await fetchJson<SleeperLeagueSettings>(
    `${SLEEPER_BASE}/league/${leagueId}`,
    { next: { revalidate: 3600 } }
  );
  const start = league.settings?.playoff_week_start;
  return start && start > 0
    ? Math.min(start + PLAYOFF_WEEKS_LENGTH - 1, 17)
    : DEFAULT_PLAYOFF_END_WEEK;
}

// Duplicated per this codebase's established convention (identical helper
// already exists in lib/db/snapshot.ts, lib/trade-odds-action.ts, and
// lib/team-advice-action.ts).
async function getCurrentWeek(): Promise<number> {
  const res = await fetch(NFL_STATE_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch current NFL week (${res.status})`);
  }
  const state = (await res.json()) as { week?: number; display_week?: number };
  return state.week && state.week > 0 ? state.week : (state.display_week ?? 1);
}

const EMPTY_SOS: PlayerSos = {
  seasonLong: { favorableCount: 0, totalWeeks: 0, tier: "unavailable" },
  nearTerm: { favorableCount: 0, totalWeeks: 0, tier: "unavailable" },
};

const SOS_POSITIONS = ["QB", "RB", "WR", "TE"] as const;
type SosPosition = (typeof SOS_POSITIONS)[number];

interface SosPlayerInput {
  sleeperId: string;
  position: string;
  team: string | null;
}

/**
 * Shared core for both getTeamSos and getTradeSos: fetches each remaining
 * week's schedule once (covers every NFL team per call, so this is
 * ~10-13 fetches total regardless of how many players are being
 * evaluated) and each distinct position's defense rankings once (never
 * once per player), then tiers every requested player against them.
 */
async function computeSosForPlayers(
  season: string,
  currentWeek: number,
  playoffEndWeek: number,
  pprValue: number | undefined,
  players: SosPlayerInput[]
): Promise<Map<string, PlayerSos>> {
  const startWeek = Math.max(currentWeek, 1);
  const weekCount = Math.max(playoffEndWeek - startWeek + 1, 0);
  const weekNumbers = Array.from({ length: weekCount }, (_, i) => startWeek + i);

  const opponentsByWeek = await Promise.all(
    weekNumbers.map(async (week) => ({ week, opponents: await getTeamOpponents(season, week) }))
  );

  const remainingWeeksByTeam = new Map<string, { week: number; opponent: string | null }[]>();
  for (const { week, opponents } of opponentsByWeek) {
    for (const [team, opponent] of opponents) {
      const weeks = remainingWeeksByTeam.get(team) ?? [];
      weeks.push({ week, opponent });
      remainingWeeksByTeam.set(team, weeks);
    }
  }

  const positions = Array.from(
    new Set(players.map((p) => p.position).filter((p): p is SosPosition => (SOS_POSITIONS as readonly string[]).includes(p)))
  );
  const rankingsByPosition = new Map(
    await Promise.all(
      positions.map(
        async (position) =>
          [position, await getDefenseRankings(season, currentWeek - 1, position, pprValue)] as const
      )
    )
  );

  const result = new Map<string, PlayerSos>();
  for (const player of players) {
    const ranking = rankingsByPosition.get(player.position as SosPosition);
    if (!ranking) {
      result.set(player.sleeperId, EMPTY_SOS);
      continue;
    }
    const remainingWeeks = player.team ? (remainingWeeksByTeam.get(player.team) ?? []) : [];
    const nearTermWeeks = remainingWeeks.slice(0, NEAR_TERM_WINDOW_WEEKS);
    result.set(
      player.sleeperId,
      computePlayerSos(remainingWeeks, nearTermWeeks, ranking.ranks, ranking.totalTeams)
    );
  }
  return result;
}

export interface PlayerSosEntry {
  sleeperId: string;
  name: string;
  position: string;
  sos: PlayerSos;
}

/**
 * SOS for one team's current starters, on demand — mirrors
 * lib/team-advice-action.ts's getCoManagerAdvice shape (leagueId +
 * rosterId in, does its own fetching internally), for the dashboard.
 */
export async function getTeamSos(leagueId: string, rosterId: number): Promise<PlayerSosEntry[]> {
  const [league, leagueScoring, rosters, currentWeek, playoffEndWeek] = await Promise.all([
    getLeague(leagueId),
    getLeagueScoring(leagueId),
    getRosters(leagueId),
    getCurrentWeek(),
    getPlayoffEndWeek(leagueId),
  ]);

  const roster = rosters.find((r) => r.roster_id === rosterId);
  if (!roster) return [];

  const values = await getPlayerValues({
    totalRosters: league.total_rosters,
    pprValue: leagueScoring.scoring_settings?.rec,
    rosterPositions: league.roster_positions,
  });
  const valuesById = new Map(values.map((player) => [player.sleeperId, player]));

  const starterIds = (roster.starters ?? []).filter((id) => id && id !== "0");
  // No FantasyCalc value = not a real skill-position starter (e.g. K/DEF) —
  // same "no value = not real" convention lib/team-context.ts already uses.
  const starters = starterIds.flatMap((id) => {
    const player = valuesById.get(id);
    return player ? [player] : [];
  });

  const sosByPlayer = await computeSosForPlayers(
    league.season,
    currentWeek,
    playoffEndWeek,
    leagueScoring.scoring_settings?.rec,
    starters.map((player) => ({
      sleeperId: player.sleeperId,
      position: player.position,
      team: player.team,
    }))
  );

  return starters.map((player) => ({
    sleeperId: player.sleeperId,
    name: player.name,
    position: player.position,
    sos: sosByPlayer.get(player.sleeperId) ?? EMPTY_SOS,
  }));
}

/**
 * SOS for an arbitrary set of players, on demand — for the trade analyzer,
 * which already has TradeablePlayer data for whoever is currently in the
 * trade, so no roster fetch is needed here at all.
 */
export async function getTradeSos(
  leagueId: string,
  players: SosPlayerInput[]
): Promise<Map<string, PlayerSos>> {
  if (players.length === 0) return new Map();

  const [league, leagueScoring, currentWeek, playoffEndWeek] = await Promise.all([
    getLeague(leagueId),
    getLeagueScoring(leagueId),
    getCurrentWeek(),
    getPlayoffEndWeek(leagueId),
  ]);

  return computeSosForPlayers(
    league.season,
    currentWeek,
    playoffEndWeek,
    leagueScoring.scoring_settings?.rec,
    players
  );
}
