import { fetchJson } from "../http";
import type { EspnLeagueRef } from "../espn-league";
import type { EspnLeagueResponse } from "./types";

// The only module in the app that knows espn.com exists.
//
// NOTE the host: the widely-cited `fantasy.espn.com/apis/v3/...` endpoint no
// longer serves this API — it 302s to ESPN's marketing page, which surfaces as
// an HTML body where JSON is expected rather than as a clean HTTP error. Reads
// moved to `lm-api-reads.`, verified against live public leagues. If ESPN
// support breaks wholesale someday, this constant is the first thing to check.
const ESPN_BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons";

// One request carries everything the app needs: settings (format/scoring/
// playoff structure), teams (records + rosters), and the full schedule. Asking
// for all four views at once rather than per-feature keeps the unofficial
// surface area we depend on as small as possible, and Next dedupes the
// identical fetch across a request so the page/action/odds paths share it.
const LEAGUE_VIEWS = ["mSettings", "mTeam", "mRoster", "mMatchup"] as const;

function leagueUrl(ref: EspnLeagueRef): string {
  const views = LEAGUE_VIEWS.map((view) => `view=${view}`).join("&");
  return `${ESPN_BASE}/${ref.season}/segments/0/leagues/${ref.espnLeagueId}?${views}`;
}

/**
 * Fetches a public ESPN league.
 *
 * Throws HttpError on failure, so callers use the existing isNotFound() /
 * isUnauthorized() helpers rather than a bespoke error type. The two statuses
 * that matter, both confirmed against live ESPN responses:
 *
 * - 404 — no league with that ID in that season.
 * - 401 — the league exists but is private. Phase 1 is public-leagues-only
 *   (private leagues need cookie auth), so this is a real, expected outcome
 *   that deserves its own message, not a generic failure.
 *
 * Revalidation matches the Sleeper path's hourly cadence: roster and matchup
 * data doesn't move faster than that, and it keeps repeat page loads off a
 * third-party API we don't control.
 */
export function fetchEspnLeague(ref: EspnLeagueRef): Promise<EspnLeagueResponse> {
  return fetchJson<EspnLeagueResponse>(leagueUrl(ref), {
    next: { revalidate: 3600 },
  });
}
