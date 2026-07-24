"use server";

import { getLeague } from "@/lib/sleeper";

export interface LeagueValidationResult {
  ok: boolean;
  leagueName?: string;
  error?: string;
}

// Sleeper returns a 404 (body "null") for a malformed or nonexistent
// league ID, which getLeague() already turns into a thrown error — so an
// invalid ID is just "the fetch failed" here, nothing more to parse.
export async function validateLeagueId(leagueId: string): Promise<LeagueValidationResult> {
  const trimmed = leagueId.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter a league ID." };
  }

  try {
    const league = await getLeague(trimmed);
    return { ok: true, leagueName: league.name };
  } catch {
    return { ok: false, error: "Couldn't find a Sleeper league with that ID." };
  }
}
