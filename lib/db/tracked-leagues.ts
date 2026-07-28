import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}
const sql = neon(process.env.DATABASE_URL);

// Called fire-and-forget from validateLeagueId() on every successful
// validation — never on the critical path of the user-facing response.
export async function trackLeagueSeen(leagueId: string): Promise<void> {
  await sql`
    INSERT INTO tracked_leagues (league_id)
    VALUES (${leagueId})
    ON CONFLICT (league_id) DO UPDATE SET last_seen = now()
  `;
}

export async function getTrackedLeagueIds(): Promise<string[]> {
  const rows = await sql`SELECT league_id FROM tracked_leagues ORDER BY league_id`;
  return rows.map((row) => row.league_id as string);
}
