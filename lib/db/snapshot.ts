import { neon } from "@neondatabase/serverless";

import { getLeagueData } from "@/lib/league-data";
import { managerTeamName } from "@/lib/league-types";
import { getPlayoffOdds } from "@/lib/playoff-odds";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}
const sql = neon(process.env.DATABASE_URL);

// Not exposed by lib/sleeper.ts and not league-scoped, so fetched directly
// here — same approach lib/trade-odds-action.ts uses for the same
// endpoint.
const NFL_STATE_URL = "https://api.sleeper.app/v1/state/nfl";

async function getCurrentWeek(): Promise<number> {
  const res = await fetch(NFL_STATE_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch current NFL week (${res.status})`);
  }
  const state = (await res.json()) as { week?: number; display_week?: number };
  return state.week && state.week > 0 ? state.week : (state.display_week ?? 1);
}

export interface CaptureSnapshotResult {
  leagueId: string;
  season: string;
  week: number;
  teamsCaptured: number;
}

/**
 * Captures the current week's roster/record/playoff-odds state for every
 * team in the league, upserting one row per team into roster_snapshots.
 * Safe to call more than once for the same week — rows are keyed on
 * (league_id, roster_id, season, week) and get replaced, not duplicated.
 *
 * Source-agnostic: reads through getLeagueData()/getPlayoffOdds(), so a
 * validated ESPN public league is snapshotted exactly like a Sleeper one, and
 * the odds-trend signal built on this history (lib/team-advice.ts) works the
 * same for both. Starters are stored as Sleeper player IDs either way, which
 * is what makes the history comparable across sources.
 */
export async function captureSnapshot(leagueId: string): Promise<CaptureSnapshotResult> {
  const [{ league, rosters, managers }, odds, week] = await Promise.all([
    getLeagueData(leagueId),
    getPlayoffOdds(leagueId),
    getCurrentWeek(),
  ]);

  const managersById = new Map(managers.map((manager) => [manager.ownerId, manager]));
  const oddsByRosterId = new Map(odds.map((o) => [o.rosterId, o.playoffOdds]));

  await Promise.all(
    rosters.map((roster) => {
      const manager = roster.ownerId ? managersById.get(roster.ownerId) : undefined;
      const starters = JSON.stringify(roster.starters);
      const playoffOdds = oddsByRosterId.get(roster.rosterId) ?? 0;

      return sql`
        INSERT INTO roster_snapshots
          (league_id, roster_id, team_name, season, week, starters, wins, losses, ties, playoff_odds)
        VALUES (
          ${leagueId},
          ${roster.rosterId},
          ${managerTeamName(manager)},
          ${league.season},
          ${week},
          ${starters}::jsonb,
          ${roster.wins},
          ${roster.losses},
          ${roster.ties},
          ${playoffOdds}
        )
        ON CONFLICT (league_id, roster_id, season, week)
        DO UPDATE SET
          team_name = EXCLUDED.team_name,
          starters = EXCLUDED.starters,
          wins = EXCLUDED.wins,
          losses = EXCLUDED.losses,
          ties = EXCLUDED.ties,
          playoff_odds = EXCLUDED.playoff_odds,
          captured_at = now()
      `;
    })
  );

  return {
    leagueId,
    season: league.season,
    week,
    teamsCaptured: rosters.length,
  };
}

/**
 * Recent playoff-odds history for one team, ascending by week — powers the
 * co-manager advice odds-trend signal (lib/team-advice.ts). First reader
 * ever written against roster_snapshots; captureSnapshot() above is
 * write-only.
 */
export async function getRecentOddsHistory(
  leagueId: string,
  rosterId: number,
  weeks = 4
): Promise<{ week: number; playoffOdds: number }[]> {
  const rows = await sql`
    SELECT week, playoff_odds
    FROM roster_snapshots
    WHERE league_id = ${leagueId} AND roster_id = ${rosterId}
    ORDER BY week DESC
    LIMIT ${weeks}
  `;
  return rows
    .map((row) => ({ week: row.week as number, playoffOdds: row.playoff_odds as number }))
    .reverse();
}

export interface OddsMover {
  rosterId: number;
  priorWeek: number;
  latestWeek: number;
  priorOdds: number;
  latestOdds: number;
  delta: number;
}

/**
 * The league's biggest week-over-week playoff-odds swings, ranked by
 * magnitude regardless of direction — powers the odds page's "Biggest
 * Movers" panel. Team names deliberately aren't returned here: the caller
 * (app/[leagueId]/odds/page.tsx) already has a fresher source for those
 * (getPlayoffOdds()'s live result), so this stays scoped to what only the
 * snapshot table can answer — the historical numbers.
 *
 * The INNER JOIN against each roster's own second-most-recent week is the
 * entire "not enough history" handling: a roster with only one snapshot (or
 * none) has no rn=2 row to join against, so it's silently excluded rather
 * than needing a separate branch — the empty-array case (fewer than two
 * distinct weeks league-wide) is just what falls out when nothing joins.
 */
export async function getWeekOverWeekOddsMovers(
  leagueId: string,
  limit = 5
): Promise<OddsMover[]> {
  const rows = await sql`
    WITH ranked AS (
      SELECT roster_id, week, playoff_odds,
             ROW_NUMBER() OVER (PARTITION BY roster_id ORDER BY week DESC) AS rn
      FROM roster_snapshots
      WHERE league_id = ${leagueId}
    )
    SELECT
      latest.roster_id,
      latest.week AS latest_week,
      latest.playoff_odds AS latest_odds,
      prior.week AS prior_week,
      prior.playoff_odds AS prior_odds
    FROM ranked latest
    JOIN ranked prior ON prior.roster_id = latest.roster_id AND prior.rn = 2
    WHERE latest.rn = 1
    ORDER BY abs(latest.playoff_odds - prior.playoff_odds) DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    rosterId: row.roster_id as number,
    priorWeek: row.prior_week as number,
    latestWeek: row.latest_week as number,
    priorOdds: row.prior_odds as number,
    latestOdds: row.latest_odds as number,
    delta: (row.latest_odds as number) - (row.prior_odds as number),
  }));
}
