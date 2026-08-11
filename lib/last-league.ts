// The "Continue with <league>" shortcut on the entry screens. Browser-only
// state, deliberately not on the account: it's a convenience for this device,
// not a preference worth syncing.
//
// Extracted from components/league-entry.tsx once a second entry form (ESPN)
// needed to write the same key — two components writing the same localStorage
// key from two private copies of it is exactly how they drift apart.

export const LAST_LEAGUE_STORAGE_KEY = "front-office:last-league";

export interface LastLeague {
  leagueId: string;
  leagueName: string;
}

export function parseLastLeague(raw: string | null): LastLeague | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LastLeague>;
    if (typeof parsed.leagueId === "string" && typeof parsed.leagueName === "string") {
      return { leagueId: parsed.leagueId, leagueName: parsed.leagueName };
    }
  } catch {
    // Ignore malformed stored data.
  }
  return null;
}

export function rememberLastLeague(leagueId: string, leagueName: string): void {
  window.localStorage.setItem(
    LAST_LEAGUE_STORAGE_KEY,
    JSON.stringify({ leagueId, leagueName })
  );
}
