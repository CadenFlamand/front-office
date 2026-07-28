"use server";

import { isNotFound } from "@/lib/http";
import { getLeague } from "@/lib/sleeper";

export interface LeagueValidationResult {
  ok: boolean;
  leagueName?: string;
  error?: string;
}

// Sleeper returns a 404 (body "null") for a malformed or nonexistent league
// ID, which getLeague() turns into a thrown HttpError — distinguished here
// from a timeout/5xx/network failure so a transient Sleeper outage doesn't
// tell the user their league doesn't exist.
export async function validateLeagueId(leagueId: string): Promise<LeagueValidationResult> {
  const trimmed = leagueId.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter a league ID." };
  }

  try {
    const league = await getLeague(trimmed);
    return { ok: true, leagueName: league.name };
  } catch (error) {
    if (isNotFound(error)) {
      return { ok: false, error: "Couldn't find a Sleeper league with that ID." };
    }
    return {
      ok: false,
      error: "Couldn't reach Sleeper right now — try again in a moment.",
    };
  }
}
