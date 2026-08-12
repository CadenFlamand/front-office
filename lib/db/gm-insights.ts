import "server-only";

import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}
const sql = neon(process.env.DATABASE_URL);

export interface GmInsight {
  id: number;
  content: string;
  playerId: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface GmInsightRow {
  id: number;
  content: string;
  player_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

function toGmInsight(row: GmInsightRow): GmInsight {
  return {
    id: row.id,
    content: row.content,
    playerId: row.player_id,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Every insight, active and inactive, newest first — for the admin list. */
export async function listGmInsights(): Promise<GmInsight[]> {
  const rows = (await sql`
    SELECT id, content, player_id, active, created_at, updated_at
    FROM gm_insights
    ORDER BY created_at DESC
  `) as GmInsightRow[];
  return rows.map(toGmInsight);
}

export async function createGmInsight(
  content: string,
  playerId: string | null
): Promise<GmInsight> {
  const rows = (await sql`
    INSERT INTO gm_insights (content, player_id)
    VALUES (${content}, ${playerId})
    RETURNING id, content, player_id, active, created_at, updated_at
  `) as GmInsightRow[];
  return toGmInsight(rows[0]);
}

export async function updateGmInsight(
  id: number,
  content: string,
  playerId: string | null
): Promise<GmInsight | null> {
  const rows = (await sql`
    UPDATE gm_insights
    SET content = ${content}, player_id = ${playerId}, updated_at = now()
    WHERE id = ${id}
    RETURNING id, content, player_id, active, created_at, updated_at
  `) as GmInsightRow[];
  return rows[0] ? toGmInsight(rows[0]) : null;
}

export async function setGmInsightActive(id: number, active: boolean): Promise<void> {
  await sql`UPDATE gm_insights SET active = ${active}, updated_at = now() WHERE id = ${id}`;
}

export async function deleteGmInsight(id: number): Promise<void> {
  await sql`DELETE FROM gm_insights WHERE id = ${id}`;
}

/**
 * Active insights relevant to a roster: every general/scenario note
 * (player_id IS NULL) plus any note tied to a player actually on this
 * roster. General insights first, newest-first within each group — general
 * notes are scenario/team-wide context, so they read before the more
 * specific player callouts. Caller supplies the roster's player IDs; this
 * module has no notion of a "roster" itself.
 */
export async function getActiveGmInsightsForPlayers(playerIds: string[]): Promise<GmInsight[]> {
  const rows = (await sql`
    SELECT id, content, player_id, active, created_at, updated_at
    FROM gm_insights
    WHERE active = true AND (player_id IS NULL OR player_id = ANY(${playerIds}))
    ORDER BY (player_id IS NULL) DESC, created_at DESC
  `) as GmInsightRow[];
  return rows.map(toGmInsight);
}
