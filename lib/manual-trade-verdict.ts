import type { TradeablePlayer } from "./fantasycalc";
import { LARGE_VALUE_DIFF_THRESHOLD, SMALL_VALUE_DIFF_THRESHOLD } from "./trade-label";
import { dominantPosition, type TradeVerdict, type VerdictTone } from "./trade-verdict";

export interface ManualTradeVerdictInput {
  diff: number;
  giveIds: string[];
  receiveIds: string[];
  playersById: Map<string, TradeablePlayer>;
}

function classifyValueDelta(diff: number): VerdictTone {
  if (diff > SMALL_VALUE_DIFF_THRESHOLD) return "positive";
  if (diff < -SMALL_VALUE_DIFF_THRESHOLD) return "negative";
  return "neutral";
}

/**
 * Manual-league analog of lib/trade-verdict.ts's computeTradeVerdict —
 * that module is left completely untouched (zero risk to the working
 * Sleeper trade flow). No playoff-odds simulation exists for a manual
 * league, so headline/tone/helps are driven by trade *value* alone rather
 * than an odds swing. Reuses the same value-gap and cross-position caution
 * checks, since neither of those actually needs odds data — only the
 * odds-driven headline/tone need a genuinely different (value-only)
 * computation here.
 */
export function computeManualTradeVerdict({
  diff,
  giveIds,
  receiveIds,
  playersById,
}: ManualTradeVerdictInput): TradeVerdict {
  const tone = classifyValueDelta(diff);
  const helps = tone !== "negative";

  const headline =
    tone === "positive"
      ? `You gain ${diff.toLocaleString()} in trade value`
      : tone === "negative"
        ? `You lose ${Math.abs(diff).toLocaleString()} in trade value`
        : "Roughly even in trade value";

  const valueCaption =
    diff > 0
      ? `Market value: you gain +${diff.toLocaleString()} in trade value`
      : diff < 0
        ? `Market value: you lose ${Math.abs(diff).toLocaleString()} in trade value`
        : "Market value: dead even";

  const cautions: string[] = [];

  if (diff <= -LARGE_VALUE_DIFF_THRESHOLD) {
    cautions.push("You're giving up notably more trade value than you're getting back.");
  }

  const giveDominant = dominantPosition(giveIds, playersById);
  const receiveDominant = dominantPosition(receiveIds, playersById);
  if (giveDominant && receiveDominant && giveDominant !== receiveDominant) {
    cautions.push(
      `This trades ${giveDominant} value for ${receiveDominant} value — cross-position swaps are harder to compare directly, since positions score differently by nature.`
    );
  }

  cautions.push(
    "No playoff-odds simulation for manual leagues — this verdict is based on trade value alone."
  );

  return { headline, tone, helps, valueCaption, cautions };
}
