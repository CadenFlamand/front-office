"use server";

import { getAllPlayers, getPlayerName, getRosters, type PlayersById } from "./sleeper";

export interface RosterPlayer {
  playerId: string;
  name: string;
  position: string;
}

export interface TeamRoster {
  starters: RosterPlayer[];
  bench: RosterPlayer[];
}

function resolvePlayer(playerId: string, players: PlayersById): RosterPlayer {
  return {
    playerId,
    name: getPlayerName(playerId, players),
    position: players[playerId]?.position ?? "?",
  };
}

/**
 * A team's starters and bench, on demand — mirrors lib/team-advice-action.ts's
 * getCoManagerAdvice shape (leagueId + rosterId in, does its own fetching
 * internally), for the dashboard's roster card. Uses roster.starters/
 * players, already fetched everywhere else in the app — no new endpoint.
 */
export async function getTeamRoster(
  leagueId: string,
  rosterId: number
): Promise<TeamRoster | null> {
  const [rosters, allPlayers] = await Promise.all([getRosters(leagueId), getAllPlayers()]);

  const roster = rosters.find((r) => r.roster_id === rosterId);
  if (!roster) return null;

  // Empty starter slots are represented as "0" — same filter convention
  // already used in lib/trade-odds-action.ts.
  const starterIds = (roster.starters ?? []).filter((id) => id && id !== "0");
  const starterIdSet = new Set(starterIds);
  const benchIds = (roster.players ?? []).filter((id) => !starterIdSet.has(id));

  return {
    starters: starterIds.map((id) => resolvePlayer(id, allPlayers)),
    bench: benchIds.map((id) => resolvePlayer(id, allPlayers)),
  };
}
