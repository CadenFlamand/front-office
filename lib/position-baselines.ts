import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}
const sql = neon(process.env.DATABASE_URL);

export type ScoringFormat = "standard" | "half_ppr" | "ppr";
export type BaselineTier = "top_12" | "top_24" | "top_36" | "replacement_level";

// Maps Sleeper's numeric scoring_settings.rec value (the same field
// lib/team-context.ts's getLeagueScoring() reads) to the nearest of the
// three baseline buckets computed by scripts/ingest-position-baselines.ts.
export function pprValueToFormat(pprValue: number | undefined): ScoringFormat {
  const rec = pprValue ?? 1;
  if (rec <= 0.25) return "standard";
  if (rec < 0.75) return "half_ppr";
  return "ppr";
}

interface BaselineRow {
  season: string;
  points_threshold: string;
}

/**
 * Averages position_scoring_baselines' points_threshold across the most
 * recent `seasons` seasons on file for the given position/format/tier —
 * deliberately not a single season's number, since positional scoring
 * environments shift year to year (e.g. TE scoring trending up recently).
 * Returns null if no baseline data exists yet (table empty/not ingested).
 */
export async function getPositionBaseline(
  position: string,
  format: ScoringFormat,
  tier: BaselineTier,
  opts: { seasons?: number } = {},
): Promise<number | null> {
  const seasons = opts.seasons ?? 3;

  const rows = (await sql`
    SELECT season, points_threshold
    FROM position_scoring_baselines
    WHERE position = ${position} AND scoring_format = ${format} AND tier = ${tier}
    ORDER BY season DESC
    LIMIT ${seasons}
  `) as BaselineRow[];

  if (rows.length === 0) return null;

  const sum = rows.reduce((total, row) => total + Number(row.points_threshold), 0);
  return sum / rows.length;
}
