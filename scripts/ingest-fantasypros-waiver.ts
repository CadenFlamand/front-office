// Ingestion of FantasyPros' Waiver Wire Rankings export into
// fantasypros_waiver_values. Mirrors scripts/ingest-fantasypros-values.ts's
// shape (read CSV, match against Sleeper via lib/player-name-matching.ts,
// full-replace the table) but for a *different* FantasyPros export — the
// waiver rankings CSV is not published until the season is underway (no
// meaningful "who's hot on waivers" signal exists pre-season), so its exact
// column layout was unknown when this was scaffolded.
//
// loadRows() below is a deliberate stub: DO NOT guess at column names.
// Once a real export is dropped in data/, read its actual header row and
// fill in the real column mapping (see ingest-fantasypros-values.ts's
// CsvRow/parsePosition for the pattern) before running this for real.
//
// Run: npm run ingest:fantasypros-waiver
import { readFileSync } from "node:fs";

import { neon } from "@neondatabase/serverless";
import { parse } from "csv-parse/sync";

import { buildSleeperMatchIndex, matchPlayer } from "../lib/player-name-matching";
import { getAllPlayers } from "../lib/sleeper";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}
const sql = neon(process.env.DATABASE_URL);

// Override with FANTASYPROS_WAIVER_CSV_PATH once the real filename is
// known — deliberately not guessed here.
const CSV_PATH = process.env.FANTASYPROS_WAIVER_CSV_PATH ?? "data/FantasyPros_Waiver_Wire_Rankings.csv";

interface ParsedRow {
  rank: number;
  name: string;
  team: string | null;
  position: string;
}

function loadRows(): ParsedRow[] {
  const raw = readFileSync(CSV_PATH, "utf-8");
  // parse() call is here to fail loudly (bad path, unreadable file) even
  // before the stub below — the real column mapping still needs filling in.
  parse(raw, { columns: true, skip_empty_lines: true, relax_column_count: true });

  throw new Error(
    "loadRows() is a stub — read the real CSV's header row (see the top-of-file " +
      "comment) and replace this with actual column mapping before running."
  );
}

async function main() {
  const rows = loadRows();
  console.log(`Loaded ${rows.length} rows from ${CSV_PATH}.`);

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
      console.log(`  [${reason}] rank ${row.rank}: "${row.name}" (${row.position}, ${row.team ?? "FA"})`);
    }
  }

  // Full replace each run — same "current snapshot, not history" semantics
  // as fantasypros_values.
  await sql`DELETE FROM fantasypros_waiver_values`;

  for (const { sleeperId, row } of matched) {
    await sql`
      INSERT INTO fantasypros_waiver_values
        (sleeper_player_id, player_name, position, team, waiver_rank)
      VALUES (${sleeperId}, ${row.name}, ${row.position}, ${row.team}, ${row.rank})
      ON CONFLICT (sleeper_player_id)
      DO UPDATE SET
        player_name = EXCLUDED.player_name,
        position = EXCLUDED.position,
        team = EXCLUDED.team,
        waiver_rank = EXCLUDED.waiver_rank,
        updated_at = now()
    `;
  }

  console.log(`\nWrote ${matched.length} rows to fantasypros_waiver_values.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
