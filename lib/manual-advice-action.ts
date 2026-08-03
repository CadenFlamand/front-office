"use server";

import { getManualTeamContexts } from "./manual-team-context";
import { computeMindfulPositionFlags, type AdviceSignals } from "./team-advice";

/**
 * Manual-league analog of lib/team-advice-action.ts's getCoManagerAdvice.
 * Only the fixed-cutoff mindful-position-flags signal is available — no
 * diagnostic note (needs PF rank, which needs weekly scoring data manual
 * leagues don't have), no thin-position action table (needs a real league
 * roster format to compute a league-relative bar against), no sell-high/
 * SOS flags (needs real schedule data). Shown unconditionally rather than
 * stage-gated — a manual league has no real trade-deadline calendar to
 * stage against, so `stage` below is nominal, not consumed by rendering
 * (formatAdviceCompact/formatAdviceExpanded only read the signal fields).
 */
export async function getManualCoManagerAdvice(
  leagueId: string,
  teamId: number
): Promise<AdviceSignals | null> {
  const { teams } = await getManualTeamContexts(leagueId);
  const team = teams.find((t) => t.rosterId === teamId);
  if (!team) return null;

  return {
    stage: "diagnostic",
    mindfulFlags: computeMindfulPositionFlags([], team.positionStrength),
    thinPositionActions: [],
  };
}
