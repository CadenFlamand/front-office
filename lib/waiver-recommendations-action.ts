"use server";

import { getWaiverValues } from "./fantasypros-waiver-values";
import { getLeagueData } from "./league-data";
import { isManualLeagueId } from "./manual-league";
import { getTeamContexts } from "./team-context";
import { computeWaiverRecommendations, type WaiverRecommendations } from "./waiver-recommendations";

/**
 * On-demand per-team waiver recommendations, same on-demand shape as
 * lib/team-advice-action.ts's getCoManagerAdvice — team selection lives in
 * localStorage (client-only), so this is fetched from the client once a
 * team is actually picked.
 *
 * Sleeper-only: the waiver wire is a real, whole-league concept (who's on
 * someone else's live roster right now) that a manually-entered league has
 * no equivalent for — same boundary the win-win finder already draws for
 * the same reason.
 */
export async function getWaiverRecommendations(
  leagueId: string,
  rosterId: number
): Promise<WaiverRecommendations | null> {
  if (isManualLeagueId(leagueId)) return null;

  const [waiverValues, { rosters }, { teams }] = await Promise.all([
    getWaiverValues(),
    getLeagueData(leagueId),
    getTeamContexts(leagueId),
  ]);

  const team = teams.find((t) => t.rosterId === rosterId);
  if (!team) return null;

  const allRosteredPlayerIds = new Set(rosters.flatMap((roster) => roster.players));

  return computeWaiverRecommendations(
    waiverValues,
    allRosteredPlayerIds,
    team.thinPositions,
    team.positionStrength
  );
}
