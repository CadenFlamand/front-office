import { LARGE_VALUE_DIFF_THRESHOLD } from "./trade-label";
import { NEAR_ZERO_ODDS_DELTA } from "./trade-verdict";

/**
 * Whether a simulated trade is worth suggesting to both managers, and on
 * what evidence.
 *
 * There are two independent routes to qualifying, and they're different
 * kinds of claim. The odds route is a forecast: the Monte Carlo season says
 * both teams make the playoffs more often after this trade than before. The
 * needs route is structural: both rosters clear a position they were weak or
 * thin at, per composite rankings. Neither subsumes the other — a trade can
 * fix a hole without moving a saturated team's odds, and can raise odds
 * without touching a flagged position.
 */

export type WinWinKind = "win_win" | "fills_need";

export interface WinWinInput {
  myOddsDelta: number;
  partnerOddsDelta: number;
  // From the user's perspective: received value minus given value.
  valueDiff: number;
  myClearsNeed: boolean;
  partnerClearsNeed: boolean;
}

export interface WinWinAssessment {
  kind: WinWinKind;
  label: string;
  detail: string;
  oddsQualifies: boolean;
  needsQualifies: boolean;
}

const WIN_WIN_LABEL = "Win-win trade";
const FILLS_NEED_LABEL = "Fills a need for both teams";

/**
 * Returns null when a trade shouldn't be suggested at all.
 *
 * The needs route carries a non-contradiction guard rather than standing
 * completely alone: if the simulation says a side's odds actively fall, the
 * trade isn't shown however well it fills holes, because the trade analyzer
 * would immediately contradict it if the user opened the same trade there.
 *
 * A needs-only trade also gets its own label rather than borrowing
 * "Win-win". Calling a trade a win-win on roster shape alone, when the
 * simulation declined to confirm both sides improve, overstates what's
 * actually known — and lib/trade-verdict.ts exists precisely to stop two
 * surfaces reaching different conclusions about the same trade.
 */
export function assessWinWin(input: WinWinInput): WinWinAssessment | null {
  const { myOddsDelta, partnerOddsDelta, valueDiff, myClearsNeed, partnerClearsNeed } =
    input;

  // A gap this large trips the trade analyzer's value-gap caution, so it
  // can't be something this app proposes unprompted.
  if (Math.abs(valueDiff) >= LARGE_VALUE_DIFF_THRESHOLD) return null;

  const oddsQualifies =
    myOddsDelta > NEAR_ZERO_ODDS_DELTA && partnerOddsDelta > NEAR_ZERO_ODDS_DELTA;
  const needsQualifies = myClearsNeed && partnerClearsNeed;
  const contradicted =
    myOddsDelta < -NEAR_ZERO_ODDS_DELTA || partnerOddsDelta < -NEAR_ZERO_ODDS_DELTA;

  if (oddsQualifies) {
    return {
      kind: "win_win",
      label: WIN_WIN_LABEL,
      detail: needsQualifies
        ? "Both teams' playoff odds improve, and it fills a hole on both rosters."
        : "Both teams' playoff odds improve.",
      oddsQualifies,
      needsQualifies,
    };
  }

  if (needsQualifies && !contradicted) {
    return {
      kind: "fills_need",
      label: FILLS_NEED_LABEL,
      detail:
        "Both teams clear a position they're weak or thin at. The playoff-odds impact isn't decisive here.",
      oddsQualifies,
      needsQualifies,
    };
  }

  return null;
}

// Confirmed win-wins outrank needs-only suggestions; within a kind, the
// user's own gain leads, since this is their app and their decision.
export function compareAssessed<T extends { assessment: WinWinAssessment; myOddsDelta: number }>(
  a: T,
  b: T
): number {
  if (a.assessment.kind !== b.assessment.kind) {
    return a.assessment.kind === "win_win" ? -1 : 1;
  }
  return b.myOddsDelta - a.myOddsDelta;
}
