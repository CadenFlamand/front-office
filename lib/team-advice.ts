export type SeasonStage = "diagnostic" | "active_trading" | "waiver_mode";

export interface ThinPositionAction {
  position: string;
  action: string;
}

export interface OddsTrend {
  direction: "up" | "down";
  magnitude: number; // percentage points, positive
  weeksSpan: number;
}

export interface AdviceSignals {
  stage: SeasonStage;
  diagnosticNote?: string;
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
  // Ascending by week.
  oddsHistory: { week: number; playoffOdds: number }[];
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
    // No trade/waiver action is prescribed in the diagnostic stage — it's a
    // framing note only.
    thinPositionActions:
      stage === "diagnostic" ? [] : computeThinPositionActions(input.thinPositions),
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
// odds swing is time-sensitive so it leads when present, otherwise the
// diagnostic note (stage 1's only signal) or the first thin-position action.
export function formatAdviceCompact(advice: AdviceSignals): string | undefined {
  if (advice.oddsTrend) return formatOddsTrend(advice.oddsTrend);
  if (advice.diagnosticNote) return advice.diagnosticNote;
  if (advice.thinPositionActions.length > 0) {
    return formatThinPositionAction(advice.thinPositionActions[0]);
  }
  return undefined;
}

// One bullet per active signal.
export function formatAdviceExpanded(advice: AdviceSignals): string[] {
  const lines: string[] = [];
  if (advice.diagnosticNote) lines.push(advice.diagnosticNote);
  for (const action of advice.thinPositionActions) {
    lines.push(formatThinPositionAction(action));
  }
  if (advice.oddsTrend) lines.push(formatOddsTrend(advice.oddsTrend));
  return lines;
}
