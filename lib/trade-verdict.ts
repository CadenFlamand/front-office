import type { TradeablePlayer } from "./fantasycalc";
import type { TeamContext } from "./team-context";
import { LARGE_VALUE_DIFF_THRESHOLD } from "./trade-label";
import type { TradeOddsDiff } from "./trade-odds-action";

export type VerdictTone = "positive" | "negative" | "neutral";

export interface TradeVerdict {
  headline: string;
  tone: VerdictTone;
  // Whether this trade helps or hurts the team's playoff push — the single
  // source of truth for both the headline's tone and TeamContextLine's
  // helps/hurts sentence, so the two can never disagree again.
  helps: boolean;
  valueCaption: string;
  cautions: string[];
}

export interface TradeVerdictInput {
  diff: number;
  odds: TradeOddsDiff;
  team: TeamContext;
  giveIds: string[];
  receiveIds: string[];
  playersById: Map<string, TradeablePlayer>;
}

// Below this, a fresh Monte Carlo run (see lib/playoff-odds.ts) would
// plausibly flip the sign on its own — treated as "no meaningful impact"
// rather than a real improve/hurt so the headline doesn't wobble on noise.
const NEAR_ZERO_ODDS_DELTA = 0.01; // 1 percentage point

function classifyOddsDelta(oddsDelta: number): VerdictTone {
  if (oddsDelta > NEAR_ZERO_ODDS_DELTA) return "positive";
  if (oddsDelta < -NEAR_ZERO_ODDS_DELTA) return "negative";
  return "neutral";
}

function countAtPositions(
  ids: string[],
  positions: Set<string>,
  playersById: Map<string, TradeablePlayer>
): number {
  return ids.reduce((count, id) => {
    const player = playersById.get(id);
    return player && positions.has(player.position) ? count + 1 : count;
  }, 0);
}

// First-pass heuristic: "dominant" = simple majority count among a side's
// players. Ties break toward whichever position was added first — doesn't
// weigh trade value or multi-position eligibility.
export function dominantPosition(
  ids: string[],
  playersById: Map<string, TradeablePlayer>
): string | null {
  const counts = new Map<string, number>();
  for (const id of ids) {
    const player = playersById.get(id);
    if (!player) continue;
    counts.set(player.position, (counts.get(player.position) ?? 0) + 1);
  }

  let best: string | null = null;
  let bestCount = 0;
  for (const [position, count] of counts) {
    if (count > bestCount) {
      best = position;
      bestCount = count;
    }
  }
  return best;
}

/**
 * The single place that turns a trade's raw numbers (value diff, odds
 * before/after, roster context) into what the user actually reads: the
 * Verdict card's headline, TeamContextLine's helps/hurts sentence, and
 * OddsDiffLine's color — all derived from the same `tone`/`helps` here so
 * they can't independently reach different conclusions.
 */
export function computeTradeVerdict({
  diff,
  odds,
  team,
  giveIds,
  receiveIds,
  playersById,
}: TradeVerdictInput): TradeVerdict {
  const oddsDelta = odds.after - odds.before;
  const oddsDeltaPts = oddsDelta * 100;
  const tone = classifyOddsDelta(oddsDelta);

  // TeamContextLine's helps/hurts word is primary-driven by the odds sign
  // (same `tone` the headline uses), but for a near-zero odds swing it falls
  // back to whether the trade fixes or worsens a real roster hole at a
  // position this team is thin at. Deliberately never falls back to trade
  // value (`diff`) even as a last resort — doing so could point the
  // sentence opposite the (tiny but real-signed) odds number shown right
  // below it in OddsDiffLine, which is exactly the contradiction this
  // module exists to prevent.
  let helps: boolean;
  if (tone !== "neutral") {
    helps = tone === "positive";
  } else {
    const thinPositions = new Set(team.thinPositions);
    const holeChange =
      countAtPositions(receiveIds, thinPositions, playersById) -
      countAtPositions(giveIds, thinPositions, playersById);
    helps = holeChange !== 0 ? holeChange > 0 : oddsDelta >= 0;
  }

  const headline =
    tone === "positive"
      ? `Improves your playoff odds by ${oddsDeltaPts.toFixed(1)} percent`
      : tone === "negative"
        ? `Hurts your playoff odds by ${Math.abs(oddsDeltaPts).toFixed(1)} percent`
        : "No meaningful odds impact";

  const valueCaption =
    diff > 0
      ? `Market value (FantasyCalc + FantasyPros combined): you gain +${diff.toLocaleString()} in trade value`
      : diff < 0
        ? `Market value (FantasyCalc + FantasyPros combined): you lose ${Math.abs(diff).toLocaleString()} in trade value`
        : "Market value (FantasyCalc + FantasyPros combined): dead even";

  const cautions: string[] = [];

  // Value-gap caution: giving up notably more trade value than you're
  // getting back is worth flagging even when it happens to also boost
  // playoff odds — reuses trade-label.ts's "Blockbuster"-magnitude value
  // threshold rather than defining a second one.
  if (diff <= -LARGE_VALUE_DIFF_THRESHOLD) {
    cautions.push(
      tone === "positive"
        ? "Odds improve, but you're giving up notably more trade value than you're getting back — you may be able to get a similar odds boost for less."
        : "You're giving up notably more trade value than you're getting back."
    );
  }

  // Cross-positional caution: positions have structurally different scoring
  // baselines (a QB puts up more raw weekly points than an RB/WR by nature
  // of the position, independent of trade value), so an odds swing from
  // trading across positions is less trustworthy on its own than one from a
  // like-for-like swap. First-pass heuristic — doesn't weigh how lopsided
  // the position split is, just whether the majority position differs.
  const giveDominant = dominantPosition(giveIds, playersById);
  const receiveDominant = dominantPosition(receiveIds, playersById);
  if (giveDominant && receiveDominant && giveDominant !== receiveDominant) {
    cautions.push(
      `This trades ${giveDominant} value for ${receiveDominant} value — cross-position swaps make the odds swing above less reliable on its own, since positions score differently by nature.`
    );
  }

  return { headline, tone, helps, valueCaption, cautions };
}
