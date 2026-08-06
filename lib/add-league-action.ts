"use server";

import { getCurrentUser } from "@/lib/auth/dal";
import { trackLeagueSeen } from "@/lib/db/tracked-leagues";
import { addLeagueToUser } from "@/lib/db/user-leagues";
import { isNotFound } from "@/lib/http";
import { getLeague } from "@/lib/sleeper";

export interface AddLeagueResult {
  ok: boolean;
  leagueName?: string;
  error?: string;
  // Distinguishes "you've hit the free limit" from an ordinary failure so the
  // client can show the upgrade prompt rather than a plain error.
  quotaExceeded?: boolean;
}

/**
 * Validates a Sleeper league and attaches it to the signed-in account.
 *
 * Replaces the anonymous validateLeagueId() path for the entry flow. Quota is
 * enforced here, server-side — a client-only check would be trivially
 * bypassed by calling this action directly.
 */
export async function addSleeperLeague(leagueId: string): Promise<AddLeagueResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You need to be signed in." };

  const trimmed = leagueId.trim();
  if (!trimmed) return { ok: false, error: "Enter a league ID." };

  let leagueName: string;
  try {
    const league = await getLeague(trimmed);
    leagueName = league.name;
  } catch (error) {
    if (isNotFound(error)) {
      return { ok: false, error: "Couldn't find a Sleeper league with that ID." };
    }
    return { ok: false, error: "Couldn't reach Sleeper right now — try again in a moment." };
  }

  const added = await addLeagueToUser(user.id, trimmed, user.plan);
  if (!added.ok) {
    return {
      ok: false,
      quotaExceeded: true,
      error: "Free accounts can track one league.",
    };
  }

  // Fire-and-forget, exactly as the anonymous flow did: recording the league
  // for the weekly snapshot Cron should never add latency to, or fail, the
  // response the user is waiting on. tracked_leagues stays a global registry
  // independent of who owns what.
  trackLeagueSeen(trimmed).catch((error) => {
    console.error(`Failed to track league ${trimmed}:`, error);
  });

  return { ok: true, leagueName };
}
