"use server";

import { getCurrentUser } from "@/lib/auth/dal";
import { trackLeagueSeen } from "@/lib/db/tracked-leagues";
import { addLeagueToUser } from "@/lib/db/user-leagues";
import { fetchEspnLeague } from "@/lib/espn/client";
import { formatEspnLeagueId } from "@/lib/espn-league";
import { isNotFound, isUnauthorized } from "@/lib/http";
import { getLeague } from "@/lib/sleeper";

export interface AddLeagueResult {
  ok: boolean;
  leagueName?: string;
  // The app-level league ID the caller should navigate to. Only meaningful for
  // sources whose app ID differs from what the user typed — an ESPN league is
  // stored as "espn-<season>-<id>", so the client can't construct it itself.
  leagueId?: string;
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

  return { ok: true, leagueName, leagueId: trimmed };
}

/**
 * Validates a *public* ESPN league and attaches it to the signed-in account.
 *
 * Phase 1 is public leagues only. Private leagues need ESPN's cookie-based
 * auth (SWID/espn_s2), which is out of scope — so a private league gets its
 * own message rather than being lumped in with "couldn't find it", since the
 * two need completely different things from the user.
 *
 * The stored ID is "espn-<season>-<leagueId>", not the raw ESPN ID: raw ESPN
 * IDs are numeric and would be indistinguishable from Sleeper's, and ESPN
 * reuses league IDs across seasons (see lib/espn-league.ts).
 */
export async function addEspnLeague(
  espnLeagueId: string,
  season: number
): Promise<AddLeagueResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You need to be signed in." };

  const trimmed = espnLeagueId.trim();
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, error: "ESPN league IDs are numbers — check the ID and try again." };
  }
  if (!Number.isInteger(season) || season < 2000 || season > 2100) {
    return { ok: false, error: "Enter a valid season year." };
  }

  const leagueId = formatEspnLeagueId(season, trimmed);

  let leagueName: string;
  try {
    const league = await fetchEspnLeague({ season, espnLeagueId: trimmed });
    // Reaching here without credentials already proves the league is publicly
    // readable; isPublic is checked anyway so that a league ESPN starts
    // serving under different rules doesn't quietly become supported.
    if (league.settings?.isPublic === false) {
      return {
        ok: false,
        error: "That ESPN league is private. Only public leagues are supported right now.",
      };
    }
    leagueName = league.settings?.name?.trim() || `ESPN league ${trimmed}`;
  } catch (error) {
    if (isUnauthorized(error)) {
      return {
        ok: false,
        error: "That ESPN league is private. Only public leagues are supported right now.",
      };
    }
    if (isNotFound(error)) {
      return { ok: false, error: `Couldn't find an ESPN league with that ID for ${season}.` };
    }
    return { ok: false, error: "Couldn't reach ESPN right now — try again in a moment." };
  }

  const added = await addLeagueToUser(user.id, leagueId, user.plan);
  if (!added.ok) {
    return {
      ok: false,
      quotaExceeded: true,
      error: "Free accounts can track one league.",
    };
  }

  trackLeagueSeen(leagueId).catch((error) => {
    console.error(`Failed to track league ${leagueId}:`, error);
  });

  return { ok: true, leagueName, leagueId };
}
