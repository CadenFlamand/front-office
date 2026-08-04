// One-time (or once-per-season) ingestion of real NFL positional scoring
// baselines from a local CSV export (nflverse-style stats, CC0/public
// domain, 2012-2025). Reads yearly_player_stats_offense.csv, aggregates
// each player's season (some players have multiple rows in a season from
// mid-season trades — no combined row exists in the source, so stints are
// summed here), ranks players within each season/position by each of the
// three precomputed fantasy-points columns, and stores distilled per-season
// tier thresholds in position_scoring_baselines. The raw CSV (and its
// ~340MB weekly sibling, unused here) never touches production — only this
// summary table does.
//
// Run: npm run ingest:baselines
import { readFileSync } from "node:fs";

import { neon } from "@neondatabase/serverless";
import { parse } from "csv-parse/sync";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}
const sql = neon(process.env.DATABASE_URL);

// Not part of the repo — override with BASELINE_CSV_PATH if the source
// data lives somewhere else.
const CSV_PATH =
  process.env.BASELINE_CSV_PATH ??
  "C:/Users/caden/OneDrive/TradeIQ/yearly_player_stats_offense.csv";

const POSITIONS = ["QB", "RB", "WR", "TE"] as const;
type Position = (typeof POSITIONS)[number];

const SCORING_FORMATS = ["standard", "half_ppr", "ppr"] as const;

// Rank cutoffs computed for every position. replacement_level uses a
// position-specific rank approximating typical 12-team-league bench depth
// — a first-pass default, uncalibrated like every other threshold this app
// has introduced so far; easy to retune and re-run later.
const FIXED_TIER_RANKS = { top_12: 12, top_24: 24, top_36: 36 } as const;
const REPLACEMENT_RANK: Record<Position, number> = {
  QB: 30,
  RB: 60,
  WR: 60,
  TE: 30,
};

interface CsvRow {
  player_id: string;
  position: string;
  season: string;
  season_type: string;
  fantasy_points_standard: string;
  fantasy_points_half_ppr: string;
  fantasy_points_ppr: string;
}

interface PlayerSeason {
  season: string;
  position: Position;
  points: { standard: number; half_ppr: number; ppr: number };
}

// Note: this source's `games` column is unreliable across seasons (e.g.
// entirely 0.0 for most 2012 rows despite those rows' actual point totals
// being correct — Adrian Peterson's 2012 fantasy_points_ppr checks out
// against his real historical 2,097-yard season) and was deliberately not
// used here to filter "incomplete" seasons after an earlier attempt at
// that produced false positives.
function loadPlayerSeasons(): PlayerSeason[] {
  const raw = readFileSync(CSV_PATH, "utf-8");
  const rows = parse(raw, { columns: true, skip_empty_lines: true }) as CsvRow[];

  const bySeasonPlayer = new Map<string, PlayerSeason>();
  for (const row of rows) {
    if (row.season_type !== "REG") continue;
    if (!(POSITIONS as readonly string[]).includes(row.position)) continue;

    const key = `${row.player_id}|${row.season}`;
    const existing = bySeasonPlayer.get(key);
    const stint = {
      standard: Number(row.fantasy_points_standard) || 0,
      half_ppr: Number(row.fantasy_points_half_ppr) || 0,
      ppr: Number(row.fantasy_points_ppr) || 0,
    };

    if (existing) {
      // Mid-season trade: source has one row per team stint, no combined
      // row, so sum stints into one season total.
      existing.points.standard += stint.standard;
      existing.points.half_ppr += stint.half_ppr;
      existing.points.ppr += stint.ppr;
    } else {
      bySeasonPlayer.set(key, {
        season: row.season,
        position: row.position as Position,
        points: stint,
      });
    }
  }

  return [...bySeasonPlayer.values()];
}

async function main() {
  const playerSeasons = loadPlayerSeasons();
  const bySeason = new Map<string, PlayerSeason[]>();
  for (const ps of playerSeasons) {
    const list = bySeason.get(ps.season) ?? [];
    list.push(ps);
    bySeason.set(ps.season, list);
  }

  const seasons = [...bySeason.keys()].sort();
  console.log(
    `Loaded ${playerSeasons.length} regular-season skill-position player-seasons across ${seasons.length} seasons (${seasons[0]}-${seasons[seasons.length - 1]}).`,
  );

  for (const season of seasons) {
    const seasonRows = bySeason.get(season)!;
    const upserts: Promise<unknown>[] = [];
    let sampleRbTop12Ppr: number | undefined;

    for (const position of POSITIONS) {
      const posRows = seasonRows.filter((r) => r.position === position);

      for (const format of SCORING_FORMATS) {
        const sorted = posRows
          .map((r) => r.points[format])
          .sort((a, b) => b - a);

        const tiers: [string, number][] = [
          ["top_12", FIXED_TIER_RANKS.top_12],
          ["top_24", FIXED_TIER_RANKS.top_24],
          ["top_36", FIXED_TIER_RANKS.top_36],
          ["replacement_level", REPLACEMENT_RANK[position]],
        ];

        for (const [tier, rank] of tiers) {
          const points = sorted[rank - 1];
          if (points === undefined) continue; // fewer players at this rank that season

          if (position === "RB" && format === "ppr" && tier === "top_12") {
            sampleRbTop12Ppr = points;
          }

          upserts.push(
            sql`
              INSERT INTO position_scoring_baselines
                (season, position, scoring_format, tier, points_threshold)
              VALUES (${season}, ${position}, ${format}, ${tier}, ${points})
              ON CONFLICT (season, position, scoring_format, tier)
              DO UPDATE SET points_threshold = EXCLUDED.points_threshold, updated_at = now()
            `,
          );
        }
      }
    }

    await Promise.all(upserts);
    console.log(
      `${season}: upserted ${upserts.length} rows (sample RB top_12 PPR = ${sampleRbTop12Ppr?.toFixed(1) ?? "n/a"})`,
    );
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
