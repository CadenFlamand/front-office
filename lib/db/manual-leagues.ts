"use server";

import { neon } from "@neondatabase/serverless";

import { generateManualLeagueId } from "@/lib/manual-league";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}
const sql = neon(process.env.DATABASE_URL);

export interface ManualLeague {
  id: string;
  name: string;
}

export interface ManualTeam {
  id: number;
  leagueId: string;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
}

export async function createManualLeague(name: string): Promise<ManualLeague> {
  const id = generateManualLeagueId();
  await sql`INSERT INTO manual_leagues (id, name) VALUES (${id}, ${name})`;
  return { id, name };
}

export async function getManualLeague(id: string): Promise<ManualLeague | null> {
  const rows = await sql`SELECT id, name FROM manual_leagues WHERE id = ${id}`;
  if (rows.length === 0) return null;
  return { id: rows[0].id as string, name: rows[0].name as string };
}

function toManualTeam(row: Record<string, unknown>): ManualTeam {
  return {
    id: Number(row.id),
    leagueId: row.league_id as string,
    teamName: row.team_name as string,
    wins: Number(row.wins),
    losses: Number(row.losses),
    ties: Number(row.ties),
  };
}

export async function getManualTeams(leagueId: string): Promise<ManualTeam[]> {
  const rows = await sql`
    SELECT id, league_id, team_name, wins, losses, ties
    FROM manual_teams
    WHERE league_id = ${leagueId}
    ORDER BY id
  `;
  return rows.map(toManualTeam);
}

export async function addManualTeam(leagueId: string, teamName: string): Promise<ManualTeam> {
  const rows = await sql`
    INSERT INTO manual_teams (league_id, team_name)
    VALUES (${leagueId}, ${teamName})
    RETURNING id, league_id, team_name, wins, losses, ties
  `;
  return toManualTeam(rows[0]);
}

export async function renameManualTeam(teamId: number, teamName: string): Promise<void> {
  await sql`UPDATE manual_teams SET team_name = ${teamName} WHERE id = ${teamId}`;
}

export async function updateManualTeamRecord(
  teamId: number,
  wins: number,
  losses: number,
  ties: number
): Promise<void> {
  await sql`
    UPDATE manual_teams SET wins = ${wins}, losses = ${losses}, ties = ${ties}
    WHERE id = ${teamId}
  `;
}

export async function deleteManualTeam(teamId: number): Promise<void> {
  await sql`DELETE FROM manual_teams WHERE id = ${teamId}`;
}

// One player-ID list per team, keyed by team id, for every team in a
// league at once — avoids an N+1 query when building a whole league's
// rosters (see lib/manual-team-context.ts).
export async function getManualRosters(leagueId: string): Promise<Map<number, string[]>> {
  const rows = await sql`
    SELECT manual_team_players.team_id, manual_team_players.sleeper_player_id
    FROM manual_team_players
    JOIN manual_teams ON manual_teams.id = manual_team_players.team_id
    WHERE manual_teams.league_id = ${leagueId}
  `;
  const rosters = new Map<number, string[]>();
  for (const row of rows) {
    const teamId = Number(row.team_id);
    const players = rosters.get(teamId) ?? [];
    players.push(row.sleeper_player_id as string);
    rosters.set(teamId, players);
  }
  return rosters;
}

export async function getManualTeamPlayers(teamId: number): Promise<string[]> {
  const rows = await sql`
    SELECT sleeper_player_id FROM manual_team_players
    WHERE team_id = ${teamId}
    ORDER BY added_at
  `;
  return rows.map((row) => row.sleeper_player_id as string);
}

export async function addManualPlayer(teamId: number, sleeperPlayerId: string): Promise<void> {
  await sql`
    INSERT INTO manual_team_players (team_id, sleeper_player_id)
    VALUES (${teamId}, ${sleeperPlayerId})
    ON CONFLICT (team_id, sleeper_player_id) DO NOTHING
  `;
}

export async function removeManualPlayer(
  teamId: number,
  sleeperPlayerId: string
): Promise<void> {
  await sql`
    DELETE FROM manual_team_players
    WHERE team_id = ${teamId} AND sleeper_player_id = ${sleeperPlayerId}
  `;
}
