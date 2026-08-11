"use server";

import { getDefenseRankings } from "./defense-rankings";
import { getPlayerValues } from "./fantasycalc";
import { getLeagueData } from "./league-data";
import type { LeagueInfo } from "./league-types";
import { isManualLeagueId } from "./manual-league";
import { getTeamOpponents } from "./nfl-schedule";
import { computePlayerSos, NEAR_TERM_WINDOW_WEEKS, type PlayerSos } from "./sos";

const SLEEPER_BASE = "https://api.sleeper.app/v1";
const NFL_STATE_URL = `${SLEEPER_BASE}/state/nfl`;

// A league that doesn't express a playoff start gets a common default rather
// than a season-long window left open-ended — same fallback pattern as
// lib/team-advice-action.ts's DEFAULT_TRADE_DEADLINE_WEEK.
const PLAYOFF_WEEKS_LENGTH = 3;
const DEFAULT_PLAYOFF_END_WEEK = 17;
const LAST_NFL_REGULAR_SEASON_WEEK = 17;

// LeagueInfo.playoffWeekStart already carries the source's default when a
// league doesn't configure one (week 19, i.e. "no playoffs inside the regular
// season"), which would push the SOS window past the end of the NFL season —
// so that case falls back here the same way an unset value always did.
function playoffEndWeek(league: LeagueInfo): number {
  const start = league.playoffWeekStart;
  return start > 0 && start <= LAST_NFL_REGULAR_SEASON_WEEK
    ? Math.min(start + PLAYOFF_WEEKS_LENGTH - 1, LAST_NFL_REGULAR_SEASON_WEEK)
    : DEFAULT_PLAYOFF_END_WEEK;
}

// Extends the getCurrentWeek() helper duplicated elsewhere in this
// codebase (lib/db/snapshot.ts, lib/trade-odds-action.ts,
// lib/team-advice-action.ts) with `season`, which the same /state/nfl
// response already carries — needed for manual leagues below, which have
// no Sleeper league to read a season from.
async function getSeasonState(): Promise<{ week: number; season: string }> {
  const res = await fetch(NFL_STATE_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch current NFL week (${res.status})`);
  }
  const state = (await res.json()) as {
    week?: number;
    display_week?: number;
    season?: string;
  };
  return {
    week: state.week && state.week > 0 ? state.week : (state.display_week ?? 1),
    season: state.season ?? String(new Date().getFullYear()),
  };
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
  // This function is roster-lookup-shaped (Sleeper rosterId -> Sleeper
  // roster.starters) and isn't reachable for manual leagues anywhere in the
  // app today — guarded here rather than attempting a Sleeper roster fetch
  // that would 404 against a synthetic ID, in case that changes later.
  if (isManualLeagueId(leagueId)) return [];

  const [{ league, rosters }, { week: currentWeek }] = await Promise.all([
    getLeagueData(leagueId),
    getSeasonState(),
  ]);

  const roster = rosters.find((r) => r.rosterId === rosterId);
  if (!roster) return [];

  const values = await getPlayerValues({
    totalRosters: league.totalRosters,
    pprValue: league.pprValue,
    rosterPositions: league.rosterPositions,
  });
  const valuesById = new Map(values.map((player) => [player.sleeperId, player]));

  // No FantasyCalc value = not a real skill-position starter (e.g. K/DEF) —
  // same "no value = not real" convention lib/team-context.ts already uses.
  const starters = roster.starters.flatMap((id) => {
    const player = valuesById.get(id);
    return player ? [player] : [];
  });

  const sosByPlayer = await computeSosForPlayers(
    league.season,
    currentWeek,
    playoffEndWeek(league),
    league.pprValue,
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

  if (isManualLeagueId(leagueId)) {
    // No Sleeper league settings to read for a manual league — same
    // defaults lib/manual-team-context.ts uses (full PPR) plus this file's
    // own existing playoff-end-week fallback, rather than a Sleeper league
    // fetch that would 404 against a synthetic ID. Season/week still come
    // from the real (league-agnostic) current NFL state.
    const { week: currentWeek, season } = await getSeasonState();
    return computeSosForPlayers(season, currentWeek, DEFAULT_PLAYOFF_END_WEEK, 1, players);
  }

  const [{ league }, { week: currentWeek }] = await Promise.all([
    getLeagueData(leagueId),
    getSeasonState(),
  ]);

  return computeSosForPlayers(
    league.season,
    currentWeek,
    playoffEndWeek(league),
    league.pprValue,
    players
  );
}
