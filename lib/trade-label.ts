import type { TradeablePlayer } from "./fantasycalc";

export type TradeLabel = "Roster Tune-Up" | "Value Add" | "Win-Now Swing" | "Blockbuster Deal";

// First-pass magnitude thresholds, not calibrated against real season data.
// A trade reads as "large" if either signal alone is big (a lopsided value
// swap OR a real odds swing is enough on its own), and "small" only if
// both signals are quiet.
const SMALL_VALUE_DIFF_THRESHOLD = 1000;
const LARGE_VALUE_DIFF_THRESHOLD = 4000;
const SMALL_ODDS_DELTA_THRESHOLD = 0.03; // 3 percentage points
const LARGE_ODDS_DELTA_THRESHOLD = 0.1; // 10 percentage points

function isRookie(player: TradeablePlayer): boolean {
  return player.yearsExperience === 0;
}

function isInjured(player: TradeablePlayer): boolean {
  const status = player.injuryStatus?.trim().toLowerCase();
  if (!status) return false;
  return status !== "healthy" && status !== "active" && status !== "normal";
}

/**
 * Labels a trade from its magnitude (value diff, playoff-odds swing).
 * `oddsDelta` is a fraction (e.g. 0.054 for +5.4 points), matching
 * TradeOddsDiff's before/after scale.
 *
 * The middle-magnitude tier is split by what's coming back: a rookie or
 * currently injured received player reads as speculative upside
 * ("Value Add"), an established healthy one as a proven, win-now player
 * ("Win-Now Swing"). This is a first-pass heuristic that only looks at the
 * receiving side — it doesn't weigh what's being given up, multi-player
 * trades where only one side is speculative, or anything beyond rookie/
 * injury status.
 */
export function getTradeLabel(
  diff: number,
  oddsDelta: number,
  receivePlayers: TradeablePlayer[]
): TradeLabel {
  const absDiff = Math.abs(diff);
  const absOddsDelta = Math.abs(oddsDelta);

  if (absDiff >= LARGE_VALUE_DIFF_THRESHOLD || absOddsDelta >= LARGE_ODDS_DELTA_THRESHOLD) {
    return "Blockbuster Deal";
  }
  if (absDiff < SMALL_VALUE_DIFF_THRESHOLD && absOddsDelta < SMALL_ODDS_DELTA_THRESHOLD) {
    return "Roster Tune-Up";
  }

  const hasSpeculativeReceive = receivePlayers.some(
    (player) => isRookie(player) || isInjured(player)
  );
  return hasSpeculativeReceive ? "Value Add" : "Win-Now Swing";
}
