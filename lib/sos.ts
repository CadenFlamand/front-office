export type SosTier = "favorable" | "neutral" | "brutal" | "unavailable";

export interface SosWindow {
  favorableCount: number;
  totalWeeks: number;
  tier: SosTier;
}

export interface PlayerSos {
  seasonLong: SosWindow;
  nearTerm: SosWindow;
}

export const NEAR_TERM_WINDOW_WEEKS = 3;

// "Favorable" per spec: opponent's defense-vs-position rank falls in the
// bottom 10 of all ranked teams (worst defenses = best matchups).
const BOTTOM_N_DEFENSES = 10;

// First-pass fraction thresholds, not yet calibrated against real season
// data — same "conservative, tune later" approach as every other threshold
// introduced in the co-manager advice feature (odds-trend, rank-gap, etc.).
// A random schedule would land roughly BOTTOM_N_DEFENSES/32 (~31%) favorable
// on its own, so these are set meaningfully above/below that baseline
// rather than around 50%.
const SOS_FAVORABLE_THRESHOLD = 0.6;
const SOS_BRUTAL_THRESHOLD = 0.15;

function isFavorableMatchup(
  opponent: string,
  defenseRanks: Map<string, number>,
  totalTeams: number
): boolean {
  const rank = defenseRanks.get(opponent);
  return rank !== undefined && rank > totalTeams - BOTTOM_N_DEFENSES;
}

function tierFromFraction(favorableCount: number, totalWeeks: number): SosTier {
  if (totalWeeks === 0) return "unavailable";
  const fraction = favorableCount / totalWeeks;
  if (fraction >= SOS_FAVORABLE_THRESHOLD) return "favorable";
  if (fraction <= SOS_BRUTAL_THRESHOLD) return "brutal";
  return "neutral";
}

/**
 * Tiers one window of a player's remaining schedule against a position's
 * defense rankings — the single place "favorable" is defined, shared by
 * both the season-long and near-term windows so they can't disagree.
 * `defenseRanks: null` (no completed weeks to rank yet) and bye weeks
 * (`opponent: null`) both fall out of the count rather than counting
 * against the player either way.
 */
export function computeSosWindow(
  weeks: { opponent: string | null }[],
  defenseRanks: Map<string, number> | null,
  totalTeams: number
): SosWindow {
  if (!defenseRanks) return { favorableCount: 0, totalWeeks: 0, tier: "unavailable" };

  const playedWeeks = weeks.filter(
    (week): week is { opponent: string } => week.opponent !== null
  );
  const favorableCount = playedWeeks.filter((week) =>
    isFavorableMatchup(week.opponent, defenseRanks, totalTeams)
  ).length;

  return {
    favorableCount,
    totalWeeks: playedWeeks.length,
    tier: tierFromFraction(favorableCount, playedWeeks.length),
  };
}

export function computePlayerSos(
  remainingWeeks: { opponent: string | null }[],
  nearTermWeeks: { opponent: string | null }[],
  defenseRanks: Map<string, number> | null,
  totalTeams: number
): PlayerSos {
  return {
    seasonLong: computeSosWindow(remainingWeeks, defenseRanks, totalTeams),
    nearTerm: computeSosWindow(nearTermWeeks, defenseRanks, totalTeams),
  };
}

/**
 * Trade-timing copy for a near-term SOS tier, framed by which side of a
 * proposed trade the player is on — a brutal stretch validates giving him
 * up (sell-high) but is a caution if you're the one acquiring him, and a
 * soft stretch is the mirror image (buy-low if acquiring, a caution if
 * giving him up). Suggestion-worded per spec, never a command. Returns
 * undefined for neutral/unavailable tiers, which don't warrant a note.
 */
export function formatNearTermTradeNote(
  side: "give" | "receive",
  tier: SosTier
): string | undefined {
  if (tier === "brutal") {
    return side === "give"
      ? `Brutal next ${NEAR_TERM_WINDOW_WEEKS} weeks for him — good timing to move him while his value is high.`
      : `Heads up — brutal next ${NEAR_TERM_WINDOW_WEEKS} weeks ahead for him.`;
  }
  if (tier === "favorable") {
    return side === "give"
      ? `Heads up — his schedule is about to get soft. You may be selling at the wrong time.`
      : `Soft next ${NEAR_TERM_WINDOW_WEEKS} weeks ahead — worth considering as a buy-low timing play.`;
  }
  return undefined;
}
