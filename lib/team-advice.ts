import { NEAR_TERM_WINDOW_WEEKS } from "./sos";
import {
  computeStrengthFlags,
  computeWeakPositionFlags,
  type PositionStrength,
  type StarterPosition,
  type StrengthFlag,
  type WeakPositionFlag,
} from "./team-context";

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

export interface StrengthPositionAction {
  position: string;
  reason: "depth" | "quality";
  action: string;
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
  // Stage 2 (active_trading) only, same as sellHighFlags and for the same
  // reason — "good trade leverage" is misleading advice once the trade
  // deadline (waiver_mode) has passed, unlike thinPositionActions' weakness
  // framing, which is still worth knowing post-deadline.
  strengthActions: StrengthPositionAction[];
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
  // From TeamContext.surplusPositions (lib/team-context.ts).
  surplusPositions: string[];
  // From TeamContext.positionStrength (lib/team-context.ts).
  positionStrength: Record<"QB" | "RB" | "WR" | "TE", PositionStrength>;
  // From lib/production-pace.ts — positions where no rostered player is
  // actually scoring like a startable option this season, per real
  // historical baselines. A secondary/confidence check against
  // thinPositions above, never a replacement for it — see the doc comment
  // on computeMindfulPositionFlags() for how the two get blended.
  positionsBelowHistoricalBaseline: string[];
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

// Only ever reinforces an already-rank-flagged position's copy with a
// supporting clause when real production agrees — never adds a position
// here on production's say-so alone, since that would mean recommending a
// trade/waiver action the rank system itself doesn't corroborate.
const PRODUCTION_BACKUP_CLAUSE =
  " Recent scoring history backs this up too — your current options here aren't producing like startable players at the position.";

function computeThinPositionActions(
  thinPositions: string[],
  positionsBelowHistoricalBaseline: string[] = []
): ThinPositionAction[] {
  const productionFlagged = new Set(positionsBelowHistoricalBaseline);
  return thinPositions.flatMap((position) => {
    const action = THIN_POSITION_ACTIONS[position as keyof typeof THIN_POSITION_ACTIONS];
    if (!action) return [];
    const text = productionFlagged.has(position) ? action + PRODUCTION_BACKUP_CLAUSE : action;
    return [{ position, action: text }];
  });
}

// Positive mirror of THIN_POSITION_ACTIONS — copy layer only, the flags
// themselves (and their thresholds) live in lib/team-context.ts's
// computeStrengthFlags(). Depth and quality get distinct wording since
// they're different claims: depth is "you can afford to trade from here
// without opening a hole", quality is "this specific player is valuable
// regardless of what's behind him".
function strengthNote(flag: StrengthFlag): string {
  if (flag.reason === "depth") {
    return `${flag.position} is a strength — you have surplus depth here, good trade leverage.`;
  }
  return `Your ${flag.position} is elite — a strong trade chip if you ever wanted to leverage it.`;
}

function computeStrengthActions(
  positionStrength: Record<StarterPosition, PositionStrength>,
  surplusPositions: string[],
  weakPositions: Set<string>
): StrengthPositionAction[] {
  return computeStrengthFlags(positionStrength, surplusPositions, weakPositions).map((flag) => ({
    position: flag.position,
    reason: flag.reason,
    action: strengthNote(flag),
  }));
}

function qbTeMindfulNote(
  position: "QB" | "TE",
  flaggedByRank: boolean,
  flaggedByProduction: boolean
): string {
  const base = `${position} is weak — worth considering streaming the position early rather than locking into one starter, since that's a normal strategy at ${position}.`;

  if (flaggedByRank && flaggedByProduction) {
    return `${base} Real scoring data backs this up too — nobody here is producing like a startable option based on recent-season history.`;
  }
  if (!flaggedByRank && flaggedByProduction) {
    return `${position} looks fine by trade value, but isn't scoring like a startable option based on recent-season history — worth keeping an eye on before assuming this position is settled.`;
  }
  return base;
}

const RB_WR_ACTION_TAIL =
  "Consider trading depth from elsewhere to shore it up, or keep an eye on the waiver wire for opportunity.";

// Only the ranking-based "weak" signal blends with real-production data —
// "thin" is a pure roster-count fact that recent scoring history doesn't
// change one way or the other.
function rbWrWeakNote(
  position: "RB" | "WR",
  flaggedByProduction: boolean
): string {
  const base = `${position} is weak — you don't have two top-20 options at the position. ${RB_WR_ACTION_TAIL}`;
  if (flaggedByProduction) {
    return `${base} Real scoring data backs this up too — nobody here is producing like a startable option based on recent-season history.`;
  }
  return base;
}

function rbWrProductionOnlyNote(position: "RB" | "WR"): string {
  return `${position} looks fine by trade value, but isn't scoring like a startable option based on recent-season history — worth keeping an eye on before assuming this position is settled.`;
}

function rbWrThinNote(position: "RB" | "WR", rosterCount: number): string {
  return `${position} is thin — only ${rosterCount} rostered. ${RB_WR_ACTION_TAIL}`;
}

// Turns one structured flag into its display copy. The weak/thin evaluation
// itself (and the thresholds behind it) lives in lib/team-context.ts's
// computeWeakPositionFlags() — this module is only responsible for wording.
function weakPositionNote(flag: WeakPositionFlag): string {
  if (flag.reason === "thin") {
    return rbWrThinNote(flag.position as "RB" | "WR", flag.rosterCount);
  }
  if (flag.position === "QB" || flag.position === "TE") {
    return qbTeMindfulNote(flag.position, flag.flaggedByRank, flag.backedByProduction);
  }
  // RB/WR weak — flaggedByRank false means the rankings actually look fine
  // and only real production disagrees, which reads differently.
  return flag.flaggedByRank
    ? rbWrWeakNote(flag.position as "RB" | "WR", flag.backedByProduction)
    : rbWrProductionOnlyNote(flag.position as "RB" | "WR");
}

// Copy layer over lib/team-context.ts's computeWeakPositionFlags(), which
// owns the actual blend of the composite-rank checks, computeThinPositions()'s
// league-format-relative safety net, and lib/production-pace.ts's
// real-production check. Signature and output are unchanged from when the
// evaluation lived here.
export function computeMindfulPositionFlags(
  thinPositions: string[],
  positionStrength: Record<StarterPosition, PositionStrength>,
  positionsBelowHistoricalBaseline: string[] = []
): MindfulPositionFlag[] {
  return computeWeakPositionFlags(
    thinPositions,
    positionStrength,
    positionsBelowHistoricalBaseline
  ).map((flag) => ({ position: flag.position, note: weakPositionNote(flag) }));
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
        ? computeMindfulPositionFlags(
            input.thinPositions,
            input.positionStrength,
            input.positionsBelowHistoricalBaseline
          )
        : undefined,
    // No trade/waiver action is prescribed in the diagnostic stage — it's a
    // framing note only.
    thinPositionActions:
      stage === "diagnostic"
        ? []
        : computeThinPositionActions(input.thinPositions, input.positionsBelowHistoricalBaseline),
    sellHighFlags:
      stage === "active_trading" ? computeSellHighFlags(input.sellHighCandidates) : undefined,
    // Same gating as sellHighFlags, for the same reason — see the doc
    // comment on AdviceSignals.strengthActions.
    strengthActions:
      stage === "active_trading"
        ? computeStrengthActions(
            input.positionStrength,
            input.surplusPositions,
            new Set(
              computeWeakPositionFlags(
                input.thinPositions,
                input.positionStrength,
                input.positionsBelowHistoricalBaseline
              ).map((flag) => flag.position)
            )
          )
        : [],
    oddsTrend: computeOddsTrend(input.oddsHistory),
  };
}

// Client-consumed formatting (formatAdviceCompact, formatAdviceExpanded,
// AdviceBullet, AdviceBulletCategory) moved to lib/team-advice-format.ts —
// see that file's top comment for why. This module now only computes
// signals; nothing in it is imported by a "use client" component.
