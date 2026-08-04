import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}
const sql = neon(process.env.DATABASE_URL);

export interface FantasyProsValue {
  playerName: string;
  position: string;
  positionRank: number;
  convertedValue: number;
}

interface FantasyProsRow {
  sleeper_player_id: string;
  player_name: string;
  position: string;
  position_rank: number;
  converted_value: string;
}

// FantasyPros' converted values only change with a weekly re-run of
// scripts/ingest-fantasypros-values.ts, so an in-memory cache for the life
// of the server process is plenty — same TTL convention as
// lib/fantasycalc.ts's own FantasyCalc cache.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let cache: { data: Map<string, FantasyProsValue>; fetchedAt: number } | null = null;

export async function getFantasyProsValues(): Promise<Map<string, FantasyProsValue>> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  const rows = (await sql`
    SELECT sleeper_player_id, player_name, position, position_rank, converted_value
    FROM fantasypros_values
  `) as FantasyProsRow[];

  const data = new Map<string, FantasyProsValue>(
    rows.map((row) => [
      row.sleeper_player_id,
      {
        playerName: row.player_name,
        position: row.position,
        positionRank: row.position_rank,
        convertedValue: Number(row.converted_value),
      },
    ])
  );

  cache = { data, fetchedAt: Date.now() };
  return data;
}
