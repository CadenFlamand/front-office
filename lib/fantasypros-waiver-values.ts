import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}
const sql = neon(process.env.DATABASE_URL);

export interface WaiverValue {
  sleeperId: string;
  playerName: string;
  position: string;
  team: string | null;
  waiverRank: number;
}

interface WaiverRow {
  sleeper_player_id: string;
  player_name: string;
  position: string;
  team: string | null;
  waiver_rank: number;
}

// Mirrors lib/fantasypros-values.ts's cache convention: this table only
// changes with a weekly re-run of scripts/ingest-fantasypros-waiver.ts, so
// an in-memory cache for the life of the server process is plenty.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let cache: { data: WaiverValue[]; fetchedAt: number } | null = null;

/**
 * FantasyPros' current waiver-wire consensus ranking, sorted best-first.
 * Empty before the table has ever been ingested (schema.sql creates it
 * empty) — callers should treat [] as "no waiver data yet", not an error.
 */
export async function getWaiverValues(): Promise<WaiverValue[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  const rows = (await sql`
    SELECT sleeper_player_id, player_name, position, team, waiver_rank
    FROM fantasypros_waiver_values
    ORDER BY waiver_rank ASC
  `) as WaiverRow[];

  const data = rows.map((row) => ({
    sleeperId: row.sleeper_player_id,
    playerName: row.player_name,
    position: row.position,
    team: row.team,
    waiverRank: row.waiver_rank,
  }));

  cache = { data, fetchedAt: Date.now() };
  return data;
}
