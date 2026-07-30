import { NEAR_TERM_WINDOW_WEEKS } from "./sos";
import type { PositionStrength } from "./team-context";

export type SeasonStage = "diagnostic" | "active_trading" | "waiver_mode";

export interface ThinPositionAction {
  position: string;
  action: string;
}

export interface MindfulPositionFlag {
  position: string;
  note: string;
}

export interface OddsTrend {
  direction: "up" | "down";
  magnitude: number; // percentage points, positive
  weeksSpan: number;
}

export interface SellHighFlag {
  position: string;
  playerName: string;
  note: string;
}

export interface AdviceSignals {
  stage: SeasonStage;
  diagnosticNote?: string;
  // Stage 1 (diagnostic) only — early awareness, not action items.
  mindfulFlags?: MindfulPositionFlag[];
  // Stage 2 (active_trading) only — own-roster sell-high nudges, driven by
  // near-term SOS. No league-wide buy-low scan (that would need SOS for
  // every other roster/free agent) — that framing lives in the trade
  // analyzer instead, scoped to whichever players are already in a
  // proposed trade.
  sellHighFlags?: SellHighFlag[];
  thinPositionActions: ThinPositionAction[];
  oddsTrend?: OddsTrend;
}

export interface AdviceInput {
  currentWeek: number;
  tradeDeadlineWeek: number;
  recordRank: number;
  pfRank: number;
  totalTeams: number;
  // From TeamContext.thinPositions (lib/team-context.ts).
  thinPositions: string[];
  // From TeamContext.positionStrength (lib/team-context.ts).
  positionStrength: Record<"QB" | "RB" | "WR" | "TE", PositionStrength>;
  // Ascending by week.
  oddsHistory: { week: number; playoffOdds: number }[];
  // Starters whose near-term SOS (lib/sos.ts) tier is already "brutal" —
  // pre-filtered by the caller (lib/team-advice-action.ts), which is the
  // one with SOS data on hand; this module only turns qualifying players
  // into copy.
  sellHighCandidates: { position: string; playerName: string }[];
}

// Weeks 1-4 are diagnostic regardless of trade-deadline timing — the point
// is to read the season before recommending action, not to react to a
// league-specific deadline yet.
const DIAGNOSTIC_WEEKS_END = 4;

export function computeSeasonStage(currentWeek: number, tradeDeadlineWeek: number): SeasonStage {
  if (currentWeek <= DIAGNOSTIC_WEEKS_END) return "diagnostic";
  if (currentWeek <= tradeDeadlineWeek) return "active_trading";
  return "waiver_mode";
}

// "1" -> "1st", "2" -> "2nd", "13" -> "13th", etc.
function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function computeDiagnosticNote(
  recordRank: number,
  pfRank: number,
  totalTeams: number
): string {
  // Conservative gap threshold (a third of the league) — a small rank gap
  // in a 10-12 team league is normal noise, not a real luck signal.
  const gapThreshold = Math.ceil(totalTeams / 3);
  const gap = recordRank - pfRank;
  const recordOrdinal = ordinal(recordRank);
  const pfOrdinal = ordinal(pfRank);

  if (gap <= -gapThreshold) {
    return `Your record is ${recordOrdinal} in the league, but you're only ${pfOrdinal} in points scored — you're winning on matchup luck more than pure strength right now. Worth keeping an eye on rather than assuming this record holds.`;
  }
  if (gap >= gapThreshold) {
    return `You're scoring like a top team (${pfOrdinal} in points) despite a tougher record (${recordOrdinal}) — that reads as bad luck in close matchups, not a real weakness. Patience is warranted here, not panic.`;
  }
  return `Your record (${recordOrdinal}) and your scoring output (${pfOrdinal} in points) are lined up — the record's a fair read on where this team actually stands right now.`;
}

// Core action per thin position — universal across buckets for QB/RB/WR.
// TE is the exception: patience over trading, since a late-round/waiver TE
// frequently breaks out into a top-5 option just by landing volume/role.
const THIN_POSITION_ACTIONS: Record<"QB" | "RB" | "WR" | "TE", string> = {
  QB: "Watch waivers for a breakout streaming option, and consider matchup-streaming week to week instead of locking in one starter. If a clear upgrade surfaces in a trade, depth elsewhere can fund it.",
  RB: "Hunt waivers for backups stepping into opportunity ahead of them. Also look to trade surplus — an overperforming bench piece, or depth at a position you're stacked in — to a team that's strong at RB but weak wherever you have depth.",
  WR: "Target waivers for players stepping into opportunity, rookies included. A trade for a solid WR funded by depth elsewhere is also worth exploring.",
  TE: "Stay patient here rather than trading for it — the position is volatile enough that a waiver-wire find frequently breaks out into a top-5 option just by landing volume or role. Don't overpay unless a true elite option is available via trade.",
};

function computeThinPositionActions(thinPositions: string[]): ThinPositionAction[] {
  return thinPositions.flatMap((position) => {
    const action = THIN_POSITION_ACTIONS[position as keyof typeof THIN_POSITION_ACTIONS];
    return action ? [{ position, action }] : [];
  });
}

// Stage 1 uses fixed-cutoff checks, deliberately different from
// computeThinPositionActions()'s league-format-relative bar — early season
// is about "is your best guy actually good" (QB/TE) or "do you have enough
// bodies" (RB/WR), not "can you fill your exact starting lineup yet".
const QB_TE_TOP_RANK_THRESHOLD = 8;
const RB_WR_TOP_STARTER_RANK = 12;
// The "top 20" cutoff itself lives in lib/team-context.ts's
// computePositionStrength() (TOP20_RANK), which is what top20Count counts.
const RB_WR_MIN_BACKUP_OPTIONS = 2;
const RB_WR_LOW_ROSTER_COUNT_THRESHOLD = 5; // flags at 4 or fewer rostered

// QB/TE: streaming 1-2 deep is a normal, intentional strategy (this same
// module recommends it in later stages), so roster count isn't a signal
// here — only whether your best option is actually good.
function isQbTeWeak(strength: PositionStrength, alreadyFlagged: boolean): boolean {
  if (alreadyFlagged) return true;
  return (
    strength.bestPositionRank === null || strength.bestPositionRank > QB_TE_TOP_RANK_THRESHOLD
  );
}

// RB/WR: streaming isn't viable, so both "no real difference-maker" and
// "not enough bodies" are worth flagging.
function isRbWrThin(strength: PositionStrength, alreadyFlagged: boolean): boolean {
  if (alreadyFlagged) return true;
  const hasEliteOption =
    strength.bestPositionRank !== null && strength.bestPositionRank <= RB_WR_TOP_STARTER_RANK;
  const hasEnoughGoodOptions = strength.top20Count >= RB_WR_MIN_BACKUP_OPTIONS;
  const rankThin = !hasEliteOption && !hasEnoughGoodOptions;
  const countThin = strength.rosterCount < RB_WR_LOW_ROSTER_COUNT_THRESHOLD;
  return rankThin || countThin;
}

function mindfulNote(position: "QB" | "RB" | "WR" | "TE"): string {
  if (position === "QB" || position === "TE") {
    return `${position} is weak — worth considering streaming the position early rather than locking into one starter, since that's a normal strategy at ${position}.`;
  }
  return `${position} is thin — keep an eye on the waiver wire here. Streaming isn't really viable at ${position}, so this is more about staying alert than making a move yet.`;
}

function computeMindfulPositionFlags(
  thinPositions: string[],
  positionStrength: Record<"QB" | "RB" | "WR" | "TE", PositionStrength>
): MindfulPositionFlag[] {
  const alreadyFlagged = new Set(thinPositions);
  const flags: MindfulPositionFlag[] = [];

  for (const position of ["QB", "RB", "WR", "TE"] as const) {
    const strength = positionStrength[position];
    const flagged =
      position === "QB" || position === "TE"
        ? isQbTeWeak(strength, alreadyFlagged.has(position))
        : isRbWrThin(strength, alreadyFlagged.has(position));
    if (flagged) flags.push({ position, note: mindfulNote(position) });
  }

  return flags;
}

function computeSellHighFlags(
  candidates: { position: string; playerName: string }[]
): SellHighFlag[] {
  return candidates.map(({ position, playerName }) => ({
    position,
    playerName,
    note: `${playerName} (${position}) has a brutal next ${NEAR_TERM_WINDOW_WEEKS} weeks — worth considering trading him now while his name value is still high.`,
  }));
}

// Conservative starting point per spec — avoid noisy/small fluctuations
// triggering the flag. Tune once real snapshot data is available.
const SIGNIFICANT_ODDS_TREND_THRESHOLD = 0.15; // 15 percentage points

function computeOddsTrend(
  history: { week: number; playoffOdds: number }[]
): OddsTrend | undefined {
  if (history.length < 2) return undefined;

  const oldest = history[0];
  const newest = history[history.length - 1];
  const delta = newest.playoffOdds - oldest.playoffOdds;
  if (Math.abs(delta) < SIGNIFICANT_ODDS_TREND_THRESHOLD) return undefined;

  return {
    direction: delta > 0 ? "up" : "down",
    magnitude: Math.abs(delta) * 100,
    weeksSpan: newest.week - oldest.week,
  };
}

/**
 * The single place that turns a team's computed signals (standings ranks,
 * thin positions, odds history) into the structured advice object every
 * render mode (compact/expanded) reads from — mirrors lib/trade-verdict.ts's
 * "compute once, render separately" pattern so the two formats can never
 * disagree about what the top signal is.
 */
export function computeCoManagerAdvice(input: AdviceInput): AdviceSignals {
  const stage = computeSeasonStage(input.currentWeek, input.tradeDeadlineWeek);

  return {
    stage,
    diagnosticNote:
      stage === "diagnostic"
        ? computeDiagnosticNote(input.recordRank, input.pfRank, input.totalTeams)
        : undefined,
    // Early awareness only, not an action item — only shown in the
    // diagnostic stage, same gating (inverted) as thinPositionActions below.
    mindfulFlags:
      stage === "diagnostic"
        ? computeMindfulPositionFlags(input.thinPositions, input.positionStrength)
        : undefined,
    // No trade/waiver action is prescribed in the diagnostic stage — it's a
    // framing note only.
    thinPositionActions:
      stage === "diagnostic" ? [] : computeThinPositionActions(input.thinPositions),
    sellHighFlags:
      stage === "active_trading" ? computeSellHighFlags(input.sellHighCandidates) : undefined,
    oddsTrend: computeOddsTrend(input.oddsHistory),
  };
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

// Single collapsed line summarizing the top-priority signal: a significant
// odds swing is time-sensitive so it leads when present; then a sell-high
// flag, since a named-player timing suggestion is more actionable than a
// generic positional note; then the diagnostic note, then the first
// mindful flag or thin-position action (mindfulFlags is diagnostic-stage-
// only and thinPositionActions is never populated in that same stage, so
// those two never actually conflict — sellHighFlags and
// thinPositionActions CAN coexist in Stage 2, which is why sellHighFlags
// is checked first).
export function formatAdviceCompact(advice: AdviceSignals): string | undefined {
  if (advice.oddsTrend) return formatOddsTrend(advice.oddsTrend);
  if (advice.sellHighFlags && advice.sellHighFlags.length > 0) {
    return advice.sellHighFlags[0].note;
  }
  if (advice.diagnosticNote) return advice.diagnosticNote;
  if (advice.mindfulFlags && advice.mindfulFlags.length > 0) {
    return advice.mindfulFlags[0].note;
  }
  if (advice.thinPositionActions.length > 0) {
    return formatThinPositionAction(advice.thinPositionActions[0]);
  }
  return undefined;
}

// One bullet per active signal.
export function formatAdviceExpanded(advice: AdviceSignals): string[] {
  const lines: string[] = [];
  if (advice.diagnosticNote) lines.push(advice.diagnosticNote);
  for (const flag of advice.mindfulFlags ?? []) {
    lines.push(flag.note);
  }
  for (const flag of advice.sellHighFlags ?? []) {
    lines.push(flag.note);
  }
  for (const action of advice.thinPositionActions) {
    lines.push(formatThinPositionAction(action));
  }
  if (advice.oddsTrend) lines.push(formatOddsTrend(advice.oddsTrend));
  return lines;
}
