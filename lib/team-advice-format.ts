import type { AdviceSignals, OddsTrend, SellHighFlag, ThinPositionAction } from "./team-advice";

/**
 * Pure formatting over an already-computed AdviceSignals, split out of
 * lib/team-advice.ts so components/co-manager-advice.tsx (a "use client"
 * component, the only caller of these two functions) can import them
 * without pulling that module's runtime dependency graph into the browser
 * bundle.
 *
 * lib/team-advice.ts itself imports lib/team-context.ts's
 * computeWeakPositionFlags() as a real (non-type) dependency, and
 * team-context.ts transitively reaches lib/fantasycalc.ts ->
 * lib/fantasypros-values.ts, which instantiates a Neon client at module
 * load time and throws immediately if DATABASE_URL isn't set — true in any
 * browser bundle, which never has server env vars. Before that
 * computeWeakPositionFlags() extraction, lib/team-advice.ts's only import
 * from team-context.ts was `import type { PositionStrength }`, fully erased
 * at compile time, so this collision didn't exist. This file only imports
 * *types* from team-advice.ts (erased, safe) and never that runtime chain.
 */

// QB/TE-sourced bullets read as a "streaming" signal (whether that's Stage
// 1's mindful-flag copy or Stage 2's thin-position-action copy); RB/WR-
// sourced bullets read as a "thin" signal. Generalizes the visual-polish
// spec's color table (written against Stage 1's exact wording) across both
// stages by position group rather than exact copy, since both stages'
// QB/TE and RB/WR bullets are fundamentally the same *kind* of signal.
function positionCategory(position: string): "streaming" | "thin" {
  return position === "QB" || position === "TE" ? "streaming" : "thin";
}

export type AdviceBulletCategory = "streaming" | "thin" | "sos" | "neutral";

export interface AdviceBullet {
  category: AdviceBulletCategory;
  text: string;
}

const ODDS_TREND_LABEL: Record<OddsTrend["direction"], string> = {
  up: "climbed",
  down: "dropped",
};

function formatOddsTrend(trend: OddsTrend): string {
  return `Your playoff odds have ${ODDS_TREND_LABEL[trend.direction]} ${trend.magnitude.toFixed(0)} points over the last ${trend.weeksSpan} week${trend.weeksSpan === 1 ? "" : "s"}.`;
}

function formatThinPositionAction(action: ThinPositionAction): string {
  return `${action.position} is thin: ${action.action}`;
}

// Stage 2 only — the only stage where thinPositionActions and sellHighFlags
// can co-occur (mindfulFlags and sellHighFlags are each stage-exclusive
// with the other, so they never need this same treatment). Folds a
// same-position sell-high note directly into its thin-position bullet
// rather than showing two separate bullets about the same position — the
// schedule-driven signal takes over the bullet's category/dot color when
// it's the reason the bullet exists. A sell-high flag whose position has no
// matching thin-position bullet stands alone as its own "sos" bullet.
function computeThinAndSellHighBullets(
  thinPositionActions: ThinPositionAction[],
  sellHighFlags: SellHighFlag[]
): AdviceBullet[] {
  const sellHighByPosition = new Map<string, SellHighFlag[]>();
  for (const flag of sellHighFlags) {
    const flags = sellHighByPosition.get(flag.position) ?? [];
    flags.push(flag);
    sellHighByPosition.set(flag.position, flags);
  }

  const bullets: AdviceBullet[] = [];
  const mergedPositions = new Set<string>();

  for (const action of thinPositionActions) {
    const matches = sellHighByPosition.get(action.position);
    if (matches && matches.length > 0) {
      mergedPositions.add(action.position);
      const sellHighText = matches.map((flag) => flag.note).join(" ");
      bullets.push({ category: "sos", text: `${formatThinPositionAction(action)} ${sellHighText}` });
    } else {
      bullets.push({ category: positionCategory(action.position), text: formatThinPositionAction(action) });
    }
  }

  for (const flag of sellHighFlags) {
    if (!mergedPositions.has(flag.position)) {
      bullets.push({ category: "sos", text: flag.note });
    }
  }

  return bullets;
}

// Single collapsed line summarizing the top-priority signal: a significant
// odds swing is time-sensitive so it leads when present; then a sell-high
// flag, since a named-player timing suggestion is more actionable than a
// generic positional note; then the diagnostic note, then the first
// mindful flag or thin-position action (mindfulFlags is diagnostic-stage-
// only and thinPositionActions is never populated in that same stage, so
// those two never actually conflict — sellHighFlags and
// thinPositionActions CAN coexist in Stage 2, which is why sellHighFlags
// is checked first). Compact mode never shows the merged sell-high +
// thin-position text — it only ever shows one line, so the merge in
// computeThinAndSellHighBullets (for the expanded list) doesn't apply here.
export function formatAdviceCompact(advice: AdviceSignals): AdviceBullet | undefined {
  if (advice.oddsTrend) {
    return { category: "neutral", text: formatOddsTrend(advice.oddsTrend) };
  }
  if (advice.sellHighFlags && advice.sellHighFlags.length > 0) {
    return { category: "sos", text: advice.sellHighFlags[0].note };
  }
  if (advice.diagnosticNote) {
    return { category: "neutral", text: advice.diagnosticNote };
  }
  if (advice.mindfulFlags && advice.mindfulFlags.length > 0) {
    const flag = advice.mindfulFlags[0];
    return { category: positionCategory(flag.position), text: flag.note };
  }
  if (advice.thinPositionActions.length > 0) {
    const action = advice.thinPositionActions[0];
    return { category: positionCategory(action.position), text: formatThinPositionAction(action) };
  }
  return undefined;
}

// One bullet per active signal, in narrative display order (not the
// priority order formatAdviceCompact uses).
export function formatAdviceExpanded(advice: AdviceSignals): AdviceBullet[] {
  const bullets: AdviceBullet[] = [];
  if (advice.diagnosticNote) bullets.push({ category: "neutral", text: advice.diagnosticNote });
  for (const flag of advice.mindfulFlags ?? []) {
    bullets.push({ category: positionCategory(flag.position), text: flag.note });
  }
  bullets.push(
    ...computeThinAndSellHighBullets(advice.thinPositionActions, advice.sellHighFlags ?? [])
  );
  if (advice.oddsTrend) bullets.push({ category: "neutral", text: formatOddsTrend(advice.oddsTrend) });
  return bullets;
}
