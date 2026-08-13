import type { TradeablePlayer } from "./fantasycalc";
import { bestLineupPoints } from "./lineup";
import {
  computePositionsBelowBaselineForRoster,
  type LeagueProductionPace,
} from "./production-pace";
import {
  computePositionStrength,
  computeSurplusPositions,
  computeWeakPositionFlags,
  type WeakPositionFlag,
} from "./team-context";
import { LARGE_VALUE_DIFF_THRESHOLD } from "./trade-label";

/**
 * Stage 1 of the win-win trade engine: generate, gate and rank candidate
 * trades cheaply enough to run over the whole league, so the expensive
 * Monte Carlo confirmation (Stage 2) only ever runs on a short list.
 *
 * Nothing in this module does I/O or simulation. The caller assembles the
 * inputs once (see the dry-run script / the server action) and this decides
 * what's worth simulating.
 *
 * The pruning rests on one property of lib/playoff-odds.ts: a roster
 * override changes exactly one thing in the simulation, the team's simMean,
 * and simMean moves only with the total projected points of its assigned
 * starting lineup. So a team's odds delta is monotone in its lineup-points
 * delta, and lineup points can be computed exactly here without simulating
 * anything.
 */

// A position counts as surplus when the roster has more startable players at
// it than the lineup requires — i.e. one can leave without opening a hole.
// "Startable" uses the same league-format-relative bar as
// computeThinPositions(), since this is a question about filling your own
// lineup, not about league-wide quality.
export interface RosterFit {
  needs: WeakPositionFlag[];
  needPositions: Set<string>;
  surplusPositions: Set<string>;
}

export interface FinderTeam {
  rosterId: number;
  teamName: string;
  // Sleeper IDs of this team's players that carry a composite value.
  valuedPlayerIds: string[];
  // Every Sleeper ID on the roster, including K/DEF and unvalued players —
  // needed to build a real starting lineup.
  allPlayerIds: string[];
}

export interface FindTradesInput {
  me: FinderTeam;
  partners: FinderTeam[];
  playersById: Map<string, TradeablePlayer>;
  positionByPlayerId: Map<string, string>;
  projectedPtsById: Map<string, number>;
  compositeRanks: Map<string, number>;
  startingSlots: string[];
  requiredStarters: Record<string, number>;
  totalRosters: number;
  leaguePace: LeagueProductionPace;
  limit?: number;
  maxPerPartner?: number;
}

export type CandidateTier = "both" | "odds" | "needs";

export interface TradeCandidate {
  partnerRosterId: number;
  partnerTeamName: string;
  giveIds: string[];
  receiveIds: string[];
  // Always from the user's perspective: received value minus given value.
  valueDiff: number;
  myPointsDelta: number;
  partnerPointsDelta: number;
  myResolvedFlags: WeakPositionFlag[];
  partnerResolvedFlags: WeakPositionFlag[];
  tier: CandidateTier;
  // Highest-value player on each side — what makes the trade recognisable,
  // and the key near-duplicate suggestions are collapsed on.
  coreGiveId: string;
  coreReceiveId: string;
}

export interface FinderStats {
  partnersConsidered: number;
  partnersComplementary: number;
  shapesEnumerated: number;
  passedValueBand: number;
  passedTierGates: number;
  returned: number;
}

export interface FinderResult {
  candidates: TradeCandidate[];
  stats: FinderStats;
  myFit: RosterFit;
  fitByPartner: Map<number, RosterFit>;
}

// First-pass magnitudes, uncalibrated like every other threshold in this app.
//
// MIN_LINEUP_POINTS_GAIN is what counts as a real lineup improvement rather
// than rounding: a fantasy team scores ~110 points a week, so a sub-1-point
// projected gain will not move a playoff-odds simulation off zero and only
// wastes Stage 2 budget. MAX_LINEUP_POINTS_LOSS is the mirror — a
// needs-based candidate whose lineup gets materially worse would be
// contradicted by the very simulation Stage 2 is about to run, so it is not
// worth showing however well it fills holes.
const MIN_LINEUP_POINTS_GAIN = 1;
const MAX_LINEUP_POINTS_LOSS = -1;

// LARGE_VALUE_DIFF_THRESHOLD is the bar for warning someone about a trade
// they already had in mind. It's far too loose for a trade this app is
// proposing unprompted: giving a 4,200 WR for a 1,000 TE is a 3,200 gap that
// never trips it, yet no one should be told to make that trade. So a
// candidate also has to be close in relative terms — the gap can't exceed a
// quarter of the larger side. That runs in both directions on purpose: a
// trade lopsided in the user's favour is just as useless, because the other
// manager would never accept it, and a suggestion nobody accepts isn't a
// win-win. First-pass fraction, uncalibrated.
const MAX_VALUE_GAP_FRACTION = 0.25;

/**
 * The finder's need signal deliberately does NOT feed computeThinPositions()'s
 * league-format-relative flags into computeWeakPositionFlags() as the
 * safety-net OR that co-manager advice uses. That OR is left exactly as it is
 * for advice — this only changes what the finder treats as a hole.
 *
 * The reason is that the league-format bar compares a startable count against
 * a *fractional* starter requirement produced by splitting FLEX slots across
 * RB/WR/TE. In a 2-RB + 2-FLEX league RB requires 2.67, so a roster needs
 * three top-32 RBs to avoid reading thin — and no roster can hold 2.67
 * players, so two elite RBs always flags. On the tracked league that fired
 * for 8 of 12 teams at RB and 8 of 12 at TE, overriding this morning's
 * fixed-cutoff thresholds in exactly the cases where the two disagree: a
 * roster with McCaffrey (RB3) and Barkley (RB10) read "RB weak" despite
 * clearing the two-top-20-options bar, and the finder went looking to trade
 * A.J. Brown to fix it.
 *
 * A signal that fires for two thirds of the league carries almost no
 * information for a *matching* engine, whose whole job is telling rosters
 * apart. So need here is the composite-ranked fixed cutoffs alone (QB top-7,
 * TE top-5, RB/WR two top-20 options, RB/WR 3-or-fewer rostered), blended
 * with real production pace.
 *
 * Surplus below still uses the league-format bar, and that asymmetry is
 * intentional: "can I afford to lose one here without opening a lineup hole"
 * genuinely is a question about filling your actual starting slots, which is
 * what that bar measures.
 */
const NO_LEAGUE_FORMAT_FLAGS: string[] = [];

const DEFAULT_LIMIT = 12;
const DEFAULT_MAX_PER_PARTNER = 3;
const MAX_PACKAGE_SIZE = 2;

function sumValue(ids: string[], playersById: Map<string, TradeablePlayer>): number {
  return ids.reduce((total, id) => total + (playersById.get(id)?.value ?? 0), 0);
}

function highestValue(ids: string[], playersById: Map<string, TradeablePlayer>): string {
  return ids.reduce((best, id) =>
    (playersById.get(id)?.value ?? 0) > (playersById.get(best)?.value ?? 0) ? id : best
  );
}

/**
 * Which positions this roster needs help at, and which it can afford to
 * trade from. Need is lib/team-context.ts's composite-ranked weak/thin
 * evaluation (QB top-7, TE top-5, RB/WR two top-20 options, RB/WR
 * 3-or-fewer rostered), blended with real production pace where there's
 * enough season to trust it.
 */
export function computeRosterFit(
  team: FinderTeam,
  playersById: Map<string, TradeablePlayer>,
  compositeRanks: Map<string, number>,
  requiredStarters: Record<string, number>,
  totalRosters: number,
  leaguePace: LeagueProductionPace
): RosterFit {
  const positionStrength = computePositionStrength(
    team.valuedPlayerIds,
    playersById,
    compositeRanks
  );
  const belowBaseline = computePositionsBelowBaselineForRoster(
    leaguePace,
    team.valuedPlayerIds
  );

  const needs = computeWeakPositionFlags(NO_LEAGUE_FORMAT_FLAGS, positionStrength, belowBaseline);
  const needPositions = new Set(needs.map((flag) => flag.position));

  const surplusPositions = new Set(
    computeSurplusPositions(
      team.valuedPlayerIds,
      playersById,
      compositeRanks,
      requiredStarters,
      totalRosters,
      needPositions
    )
  );

  return { needs, needPositions, surplusPositions };
}

// Post-trade recompute of the same evaluation, used to decide whether a
// candidate actually *clears* a flag rather than merely touching the
// position. This is what keeps the needs-based win-win criterion from
// restating the generator: the pools below already guarantee each side
// receives at a flagged position, so only a flag that disappears is
// evidence of anything.
function resolvedFlags(
  before: WeakPositionFlag[],
  team: FinderTeam,
  giveIds: string[],
  receiveIds: string[],
  input: FindTradesInput
): WeakPositionFlag[] {
  if (before.length === 0) return [];

  const given = new Set(giveIds);
  const nextValued = [...team.valuedPlayerIds.filter((id) => !given.has(id)), ...receiveIds];

  const positionStrength = computePositionStrength(
    nextValued,
    input.playersById,
    input.compositeRanks
  );
  const belowBaseline = computePositionsBelowBaselineForRoster(input.leaguePace, nextValued);

  // Same NO_LEAGUE_FORMAT_FLAGS basis as computeRosterFit above — the
  // before and after reads have to be the same evaluation or a "cleared"
  // flag could just be an artifact of measuring the two differently.
  const after = new Set(
    computeWeakPositionFlags(NO_LEAGUE_FORMAT_FLAGS, positionStrength, belowBaseline).map(
      (flag) => `${flag.position}:${flag.reason}`
    )
  );

  const cleared = before.filter((flag) => !after.has(`${flag.position}:${flag.reason}`));

  // A "thin" flag is pure roster count, so *any* body at the position clears
  // it — which let a 244-value RB swap for a 321-value WR qualify as filling
  // a need for both teams. Clearing thin only counts when what arrives is
  // actually startable, using the same league-format bar the surplus check
  // uses. "Weak" needs no equivalent guard: it's rank-based already, so it
  // can only clear if a genuinely good player arrived.
  return cleared.filter((flag) => {
    if (flag.reason !== "thin") return true;
    const bar = (input.requiredStarters[flag.position] ?? 0) * input.totalRosters;
    return receiveIds.some((id) => {
      if (input.playersById.get(id)?.position !== flag.position) return false;
      const rank = input.compositeRanks.get(id);
      return rank !== undefined && rank <= bar;
    });
  });
}

function packagesUpTo(ids: string[], maxSize: number): string[][] {
  const packages: string[][] = ids.map((id) => [id]);
  if (maxSize < 2) return packages;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      packages.push([ids[i], ids[j]]);
    }
  }
  return packages;
}

function tierRank(tier: CandidateTier): number {
  return tier === "both" ? 0 : tier === "odds" ? 1 : 2;
}

/**
 * Collapses candidates that are really the same trade with a throw-in
 * attached. "Give Egbuka for Kelce" and "give Egbuka + Concepcion for Kelce"
 * are one idea, not two, and showing both wastes a shortlist slot and Stage 2
 * budget on a near-duplicate. Keyed on the highest-value player each side
 * sends, which is what makes a trade recognisable. Input must already be
 * sorted best-first — the first candidate seen for a core pair is kept.
 */
function dedupeByCore(sorted: TradeCandidate[]): TradeCandidate[] {
  const seen = new Set<string>();
  const kept: TradeCandidate[] = [];
  for (const candidate of sorted) {
    const key = `${candidate.coreGiveId}>${candidate.coreReceiveId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(candidate);
  }
  return kept;
}

/**
 * Runs the whole Stage 1 funnel and returns a ranked shortlist.
 *
 * Candidates qualify by either of two independent routes, mirroring the two
 * win-win criteria Stage 2 confirms: a projected lineup improvement on both
 * sides ("odds"), or a weak/thin flag cleared on both sides ("needs").
 * Satisfying both ranks highest. A needs-only candidate whose lineup gets
 * materially worse is dropped rather than shown, since the simulation would
 * contradict it.
 */
export function findTradeCandidates(input: FindTradesInput): FinderResult {
  const {
    me,
    partners,
    playersById,
    positionByPlayerId,
    projectedPtsById,
    compositeRanks,
    startingSlots,
    requiredStarters,
    totalRosters,
    leaguePace,
  } = input;

  const limit = input.limit ?? DEFAULT_LIMIT;
  const maxPerPartner = input.maxPerPartner ?? DEFAULT_MAX_PER_PARTNER;

  const fitOf = (team: FinderTeam) =>
    computeRosterFit(team, playersById, compositeRanks, requiredStarters, totalRosters, leaguePace);

  const myFit = fitOf(me);
  const fitByPartner = new Map<number, RosterFit>();

  const stats: FinderStats = {
    partnersConsidered: partners.length,
    partnersComplementary: 0,
    shapesEnumerated: 0,
    passedValueBand: 0,
    passedTierGates: 0,
    returned: 0,
  };

  const linePoints = (team: FinderTeam, playerIds: string[]) =>
    bestLineupPoints(startingSlots, playerIds, positionByPlayerId, projectedPtsById);

  const myBasePoints = linePoints(me, me.allPlayerIds);
  const candidates: TradeCandidate[] = [];

  for (const partner of partners) {
    const partnerFit = fitOf(partner);
    fitByPartner.set(partner.rosterId, partnerFit);

    // Complementarity: each side must have something the other needs. Cuts
    // most of the league before any combination is enumerated.
    const iCanGet = [...myFit.needPositions].filter((p) => partnerFit.surplusPositions.has(p));
    const theyCanGet = [...partnerFit.needPositions].filter((p) => myFit.surplusPositions.has(p));
    if (iCanGet.length === 0 || theyCanGet.length === 0) continue;

    stats.partnersComplementary++;

    const giveFrom = new Set(theyCanGet);
    const receiveFrom = new Set(iCanGet);
    const givePool = me.valuedPlayerIds.filter((id) =>
      giveFrom.has(playersById.get(id)?.position ?? "")
    );
    const receivePool = partner.valuedPlayerIds.filter((id) =>
      receiveFrom.has(playersById.get(id)?.position ?? "")
    );
    if (givePool.length === 0 || receivePool.length === 0) continue;

    const partnerBasePoints = linePoints(partner, partner.allPlayerIds);
    const givePackages = packagesUpTo(givePool, MAX_PACKAGE_SIZE);
    const receivePackages = packagesUpTo(receivePool, MAX_PACKAGE_SIZE);

    const perPartner: TradeCandidate[] = [];

    for (const give of givePackages) {
      const giveValue = sumValue(give, playersById);
      const giveSet = new Set(give);
      const myRemainingAll = me.allPlayerIds.filter((id) => !giveSet.has(id));

      for (const receive of receivePackages) {
        stats.shapesEnumerated++;

        const receiveValue = sumValue(receive, playersById);
        const valueDiff = receiveValue - giveValue;
        if (Math.abs(valueDiff) >= LARGE_VALUE_DIFF_THRESHOLD) continue;
        const largerSide = Math.max(giveValue, receiveValue);
        if (largerSide > 0 && Math.abs(valueDiff) / largerSide > MAX_VALUE_GAP_FRACTION) {
          continue;
        }
        stats.passedValueBand++;

        const receiveSet = new Set(receive);
        const myPointsDelta =
          linePoints(me, [...myRemainingAll, ...receive]) - myBasePoints;
        const partnerPointsDelta =
          linePoints(partner, [
            ...partner.allPlayerIds.filter((id) => !receiveSet.has(id)),
            ...give,
          ]) - partnerBasePoints;

        const lineupsImprove =
          myPointsDelta >= MIN_LINEUP_POINTS_GAIN &&
          partnerPointsDelta >= MIN_LINEUP_POINTS_GAIN;
        const lineupsNotHarmed =
          myPointsDelta > MAX_LINEUP_POINTS_LOSS &&
          partnerPointsDelta > MAX_LINEUP_POINTS_LOSS;

        const myResolvedFlags = resolvedFlags(myFit.needs, me, give, receive, input);
        const partnerResolvedFlags = resolvedFlags(
          partnerFit.needs,
          partner,
          receive,
          give,
          input
        );
        const needsMet = myResolvedFlags.length > 0 && partnerResolvedFlags.length > 0;

        let tier: CandidateTier | null = null;
        if (lineupsImprove && needsMet) tier = "both";
        else if (lineupsImprove) tier = "odds";
        else if (needsMet && lineupsNotHarmed) tier = "needs";
        if (tier === null) continue;

        stats.passedTierGates++;
        perPartner.push({
          partnerRosterId: partner.rosterId,
          partnerTeamName: partner.teamName,
          giveIds: give,
          receiveIds: receive,
          valueDiff,
          myPointsDelta,
          partnerPointsDelta,
          myResolvedFlags,
          partnerResolvedFlags,
          tier,
          coreGiveId: highestValue(give, playersById),
          coreReceiveId: highestValue(receive, playersById),
        });
      }
    }

    perPartner.sort(compareCandidates);
    candidates.push(...dedupeByCore(perPartner).slice(0, maxPerPartner));
  }

  candidates.sort(compareCandidates);
  const shortlist = candidates.slice(0, limit);
  stats.returned = shortlist.length;

  return { candidates: shortlist, stats, myFit, fitByPartner };
}

// Tier first, then how much the *weaker* side gains — the binding constraint
// on a win-win is whichever team benefits least, not the average. Value
// balance breaks ties, since a closer trade is likelier to be accepted.
function compareCandidates(a: TradeCandidate, b: TradeCandidate): number {
  const byTier = tierRank(a.tier) - tierRank(b.tier);
  if (byTier !== 0) return byTier;

  const aWeakest = Math.min(a.myPointsDelta, a.partnerPointsDelta);
  const bWeakest = Math.min(b.myPointsDelta, b.partnerPointsDelta);
  if (aWeakest !== bWeakest) return bWeakest - aWeakest;

  const aResolved = a.myResolvedFlags.length + a.partnerResolvedFlags.length;
  const bResolved = b.myResolvedFlags.length + b.partnerResolvedFlags.length;
  if (aResolved !== bResolved) return bResolved - aResolved;

  return Math.abs(a.valueDiff) - Math.abs(b.valueDiff);
}
