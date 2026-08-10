// ESPN's fantasy API is unofficial and undocumented — every table in this
// file is a magic-number mapping recovered by inspecting live responses, not
// something ESPN publishes. It's isolated here so that when ESPN changes one
// (which they can do without warning) the fix is a table edit rather than a
// hunt through parsing logic.

/**
 * ESPN lineupSlotId -> the roster-position vocabulary the rest of the app
 * already speaks (Sleeper's).
 *
 * The output strings are load-bearing and must stay exactly Sleeper's:
 * lib/team-context.ts's slotEligiblePositions() keys off `slot.includes("FLEX")`
 * and lib/fantasycalc.ts's countNumQbs() off `slot === "QB"` /
 * `includes("SUPER_FLEX")`. A near-miss spelling here silently changes how
 * starter requirements and superflex pricing are computed.
 *
 * Slots ESPN defines but this app has no concept of (individual defensive
 * positions, head coach, punter) map to null and are dropped — they only
 * appear in IDP leagues, which are out of scope, and counting them as roster
 * spots would distort countStarterSlots().
 */
export const LINEUP_SLOT_TO_ROSTER_POSITION: Record<number, string | null> = {
  0: "QB",
  1: "QB", // TQB (team QB) — only appears in a handful of legacy formats.
  2: "RB",
  // RB/WR. Sleeper has no two-position flex token; FLEX is the closest and
  // resolves to RB/WR/TE in slotEligiblePositions(). Marginally over-broad
  // (it admits TE), which nudges the proportional starter split rather than
  // breaking it — the same approximation Sleeper's own REC_FLEX already gets.
  3: "FLEX",
  4: "WR",
  5: "FLEX", // WR/TE, same approximation as slot 3.
  6: "TE",
  7: "SUPER_FLEX", // OP (any offensive player, QB included).
  8: null, // DT
  9: null, // DE
  10: null, // LB
  11: null, // DL
  12: null, // CB
  13: null, // S
  14: null, // DB
  15: null, // DP
  16: "DEF",
  17: "K",
  18: null, // P
  19: null, // HC
  20: "BN",
  21: "IR",
  22: null, // unused
  23: "FLEX",
  24: "FLEX", // ESPN's newer generic flex.
};

// Slots that hold a player who is not in the starting lineup. Everything else
// in a roster's entries is a starter — derived by exclusion rather than by
// listing starter slots, so an unrecognised/new ESPN slot id defaults to
// "starter" instead of silently vanishing from the lineup.
export const BENCH_SLOT_ID = 20;
export const IR_SLOT_ID = 21;
export const NON_STARTER_SLOT_IDS = new Set([BENCH_SLOT_ID, IR_SLOT_ID]);

/** ESPN defaultPositionId -> position, in the app's (Sleeper's) vocabulary. */
export const POSITION_BY_ID: Record<number, string> = {
  1: "QB",
  2: "RB",
  3: "WR",
  4: "TE",
  5: "K",
  16: "DEF",
};

/**
 * ESPN proTeamId -> NFL team abbreviation, spelled the way Sleeper spells it
 * (verified against the live Sleeper catalog: WAS not WSH, LV not OAK/LVR,
 * JAX not JAC, LAR/LAC not STL/SD). These spellings matter twice over: they
 * disambiguate same-name players in lib/player-name-matching.ts's
 * matchPlayer(), and they *are* the Sleeper player_id for team defenses.
 *
 * 0 is ESPN's free-agent sentinel — a real value, not a gap, so it maps to
 * null rather than being omitted.
 */
export const PRO_TEAM_ABBREV: Record<number, string | null> = {
  0: null,
  1: "ATL",
  2: "BUF",
  3: "CHI",
  4: "CIN",
  5: "CLE",
  6: "DAL",
  7: "DEN",
  8: "DET",
  9: "GB",
  10: "TEN",
  11: "IND",
  12: "KC",
  13: "LV",
  14: "LAR",
  15: "MIA",
  16: "MIN",
  17: "NE",
  18: "NO",
  19: "NYG",
  20: "NYJ",
  21: "PHI",
  22: "ARI",
  23: "PIT",
  24: "LAC",
  25: "SF",
  26: "SEA",
  27: "TB",
  28: "WAS",
  29: "CAR",
  30: "JAX",
  33: "BAL",
  34: "HOU",
};

// ESPN scoring stat id for receptions — the one scoring rule this app reads,
// to derive the league's PPR value (see adapter.ts's derivePprValue()).
export const RECEPTIONS_STAT_ID = 53;

// ESPN position id for WR, used to pick which side of a per-position PPR
// override ("TE premium" scoring) counts as the league's headline PPR value.
export const WR_POSITION_ID = 3;

// A schedule game's `winner` is "UNDECIDED" until the matchup is final. This
// is ESPN telling us directly what lib/playoff-odds.ts's isWeekComplete() has
// to infer from NFL season state on the Sleeper side.
export const UNDECIDED = "UNDECIDED";

// Regular-season games carry playoffTierType "NONE"; anything else is a
// bracket or consolation game and never counts toward playoff seeding.
export const REGULAR_SEASON_TIER = "NONE";
