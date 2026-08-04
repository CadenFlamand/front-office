// Weekly-repeatable ingestion of FantasyPros' overall draft rankings CSV
// into a FantasyCalc-comparable value, stored in fantasypros_values.
// lib/fantasycalc.ts's getPlayerValues() blends this into FantasyCalc's own
// live value (average when both sources have a player, single-source value
// when only one does).
//
// Re-run any time with a fresh weekly export dropped in data/ — this fully
// replaces the table's contents each run rather than accumulating history,
// same "current snapshot" semantics as FantasyCalc's own live values.
//
// Run: npm run ingest:fantasypros
import { readFileSync } from "node:fs";

import { neon } from "@neondatabase/serverless";
import { parse } from "csv-parse/sync";

import { buildSleeperMatchIndex, matchPlayer } from "../lib/player-name-matching";
import { getAllPlayers } from "../lib/sleeper";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}
const sql = neon(process.env.DATABASE_URL);

// Resolved relative to the repo root (this script is run via `npm run
// ingest:fantasypros`, i.e. from cwd = repo root) — override with
// FANTASYPROS_CSV_PATH to point at a different export.
const CSV_PATH =
  process.env.FANTASYPROS_CSV_PATH ?? "data/FantasyPros_2026_Draft_ALL_Rankings.csv";

// FantasyCalc doesn't price K/DST at all (redraft trade values only cover
// skill positions) — nothing to blend against, so these are filtered out
// here to match how "tradeable value" works everywhere else in this app.
const VALUED_POSITIONS = new Set(["QB", "RB", "WR", "TE"]);

// Exponential decay calibrated against a live pull of FantasyCalc's real
// value distribution for a standard 12-team/1-QB/full-PPR redraft league:
// rank 1 ~10,461, rank ~50 ~2,800-3,500, rank ~150 ~195-230. This lands
// rank 1 at 10,500, rank 50 at ~2,907, rank 150 at ~212 — close matches
// through the range that actually matters (where both sources overlap).
// It overshoots past ~rank 200, but FantasyCalc's own values compress
// toward zero there purely because that's the edge of their ~200-player
// tracked pool, not a smooth curve to chase — and those deep ranks mostly
// won't have a FantasyCalc value to blend against anyway. First-pass
// calibration against one representative league config, like every other
// threshold in this app — revisit if it drifts.
const MAX_VALUE = 10500;
const DECAY_RATE = 0.9741;
const MIN_VALUE = 1;

function convertRankToValue(rank: number): number {
  const value = MAX_VALUE * Math.pow(DECAY_RATE, rank - 1);
  return Math.max(MIN_VALUE, Math.round(value));
}

interface CsvRow {
  RK: string;
  TIERS: string;
  "PLAYER NAME": string;
  TEAM: string;
  POS: string;
}

interface ParsedRow {
  rank: number;
  tier: number;
  name: string;
  team: string | null;
  position: string;
  positionRank: number;
}

// "WR45" -> { position: "WR", positionRank: 45 } — captured because
// FantasyPros-only players (no FantasyCalc counterpart at all) still need
// a positionRank for TradeablePlayer; this is FantasyPros' own
// position-relative rank, not a guess, so it's the right fallback rather
// than fabricating one at blend time.
function parsePosition(pos: string): { position: string; positionRank: number } {
  const match = /^([A-Z]+)(\d+)$/.exec(pos);
  if (!match) return { position: pos, positionRank: 0 };
  return { position: match[1], positionRank: Number(match[2]) };
}

function loadRows(): ParsedRow[] {
  const raw = readFileSync(CSV_PATH, "utf-8");
  // relax_column_count: FantasyPros' export has short 2-column "AD" (ad
  // break) marker rows interspersed between real player rows — filtered
  // out below by the RK-must-be-numeric check, but csv-parse's default
  // strict mode rejects the file outright before we get that far without
  // this.
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as CsvRow[];

  const parsed: ParsedRow[] = [];
  for (const row of rows) {
    const rank = Number(row.RK);
    // Skips FantasyPros' "AD" ad-break marker rows (RK="AD", no player
    // data) and anything else that isn't a real ranked player.
    if (!Number.isFinite(rank) || rank <= 0) continue;
    if (!row["PLAYER NAME"]) continue;

    const { position, positionRank } = parsePosition(row.POS ?? "");
    if (!VALUED_POSITIONS.has(position)) continue;

    parsed.push({
      rank,
      tier: Number(row.TIERS) || 0,
      name: row["PLAYER NAME"],
      team: row.TEAM && row.TEAM !== "FA" ? row.TEAM : null,
      position,
      positionRank,
    });
  }
  return parsed;
}

async function main() {
  const rows = loadRows();
  console.log(`Loaded ${rows.length} skill-position rows from ${CSV_PATH}.`);

  const players = await getAllPlayers();
  const index = buildSleeperMatchIndex(players);

  const matched: { sleeperId: string; row: ParsedRow }[] = [];
  const unmatched: { row: ParsedRow; reason: string }[] = [];

  for (const row of rows) {
    const outcome = matchPlayer(index, players, row.name, row.position, row.team);
    if ("sleeperId" in outcome) {
      matched.push({ sleeperId: outcome.sleeperId, row });
    } else {
      unmatched.push({ row, reason: outcome.error });
    }
  }

  console.log(`Matched ${matched.length} / ${rows.length}.`);
  if (unmatched.length > 0) {
    console.log(`\nUnmatched (${unmatched.length}) — not written, needs a look:`);
    for (const { row, reason } of unmatched) {
      console.log(
        `  [${reason}] rank ${row.rank}: "${row.name}" (${row.position}, ${row.team ?? "FA"})`,
      );
    }
  }

  // Full replace each run — this table is a "current snapshot" like
  // FantasyCalc's own live values, not a history, so a player who drops
  // out of this week's rankings shouldn't linger from a prior run.
  await sql`DELETE FROM fantasypros_values`;

  for (const { sleeperId, row } of matched) {
    await sql`
      INSERT INTO fantasypros_values
        (sleeper_player_id, player_name, position, position_rank, overall_rank, tier, converted_value)
      VALUES (
        ${sleeperId}, ${row.name}, ${row.position}, ${row.positionRank}, ${row.rank}, ${row.tier},
        ${convertRankToValue(row.rank)}
      )
      ON CONFLICT (sleeper_player_id)
      DO UPDATE SET
        player_name = EXCLUDED.player_name,
        position = EXCLUDED.position,
        position_rank = EXCLUDED.position_rank,
        overall_rank = EXCLUDED.overall_rank,
        tier = EXCLUDED.tier,
        converted_value = EXCLUDED.converted_value,
        updated_at = now()
    `;
  }

  console.log(`\nWrote ${matched.length} rows to fantasypros_values.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
