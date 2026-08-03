"use server";

import { getManualTeamPlayers } from "./db/manual-leagues";
import type { RosterPlayer } from "./roster-action";
import { getAllPlayers, getPlayerName } from "./sleeper";

/**
 * Flat roster (no starters/bench split — manual leagues have no real
 * weekly lineup data to split on) for one manual team, on demand. Same
 * RosterPlayer shape as lib/roster-action.ts's getTeamRoster() so
 * components/team-roster.tsx can render either with the same markup.
 */
export async function getManualTeamRoster(teamId: number): Promise<RosterPlayer[]> {
  const [playerIds, allPlayers] = await Promise.all([
    getManualTeamPlayers(teamId),
    getAllPlayers(),
  ]);

  return playerIds.map((id) => ({
    playerId: id,
    name: getPlayerName(id, allPlayers),
    position: allPlayers[id]?.position ?? "?",
  }));
}
