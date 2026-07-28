"use server";

import { trackLeagueSeen } from "@/lib/db/tracked-leagues";
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
    // Fire-and-forget: recording the league for the snapshot Cron should
    // never add latency to (or fail) the validation response the user is
    // waiting on. Still logged on failure so a broken write doesn't
    // disappear silently.
    trackLeagueSeen(trimmed).catch((error) => {
      console.error(`Failed to track league ${trimmed}:`, error);
    });
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
