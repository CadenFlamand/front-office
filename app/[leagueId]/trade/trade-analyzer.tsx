"use client";

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { Check, Loader2, Search, Share2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SosTierBadge } from "@/components/sos-tier-badge";
import { TradeFinderPanel } from "@/components/trade-finder-panel";
import type { TradeablePlayer } from "@/lib/fantasycalc";
import { isManualLeagueId } from "@/lib/manual-league";
import { computeManualTradeVerdict } from "@/lib/manual-trade-verdict";
import { formatNearTermTradeNote, type PlayerSos } from "@/lib/sos";
import { getTradeSos } from "@/lib/sos-action";
import type { PlayoffBucket, TeamContext } from "@/lib/team-context";
import { useStoredRosterId } from "@/lib/team-selection";
import { getTradeLabel } from "@/lib/trade-label";
import { getOddsForTrade, type TradeOddsDiff } from "@/lib/trade-odds-action";
import { computeTradeVerdict, type TradeVerdict, type VerdictTone } from "@/lib/trade-verdict";
import { encodeVerdict } from "@/lib/verdict-share";

const RESULT_LIMIT = 8;

type Side = "give" | "receive";

export function TradeAnalyzer({
  players,
  teams,
  leagueId,
}: {
  players: TradeablePlayer[];
  teams: TeamContext[];
  leagueId: string;
}) {
  const manual = isManualLeagueId(leagueId);
  const [giveIds, setGiveIds] = useState<string[]>([]);
  const [receiveIds, setReceiveIds] = useState<string[]>([]);

  // For this session only: if no team is saved via the home page's team
  // picker, let the user pick one here without persisting it.
  const [sessionRosterId, setSessionRosterId] = useState<number | null>(null);
  const storedRosterId = useStoredRosterId(leagueId);
  const selectedRosterId = storedRosterId ?? sessionRosterId;
  const selectedTeam = teams.find((team) => team.rosterId === selectedRosterId);

  const playersById = useMemo(
    () => new Map(players.map((player) => [player.sleeperId, player])),
    [players]
  );
  const selectedIds = useMemo(
    () => new Set([...giveIds, ...receiveIds]),
    [giveIds, receiveIds]
  );

  // "You Give" is scoped to the selected team's actual roster (already
  // fetched from Sleeper), not the full league player pool.
  const rosterPlayers = useMemo(() => {
    if (!selectedTeam) return [];
    return selectedTeam.rosterPlayerIds
      .map((id) => playersById.get(id))
      .filter((player): player is TradeablePlayer => player !== undefined);
  }, [selectedTeam, playersById]);

  // "You Receive" is session-only, same as the team picker above — a trade
  // partner isn't a durable fact about the user the way their own team is.
  const [partnerRosterId, setPartnerRosterId] = useState<number | null>(null);
  // Guards the rare case where "my team" changes (via the session picker)
  // to the roster currently set as the partner — can't trade with yourself.
  const partnerTeam =
    partnerRosterId !== null && partnerRosterId !== selectedRosterId
      ? teams.find((team) => team.rosterId === partnerRosterId)
      : undefined;

  const partnerRosterPlayers = useMemo(() => {
    if (!partnerTeam) return [];
    return partnerTeam.rosterPlayerIds
      .map((id) => playersById.get(id))
      .filter((player): player is TradeablePlayer => player !== undefined);
  }, [partnerTeam, playersById]);

  // A receive pick made against one partner's roster means nothing once the
  // partner changes, so switching (rather than loading a whole suggestion,
  // which sets its own consistent receiveIds below) starts that side over.
  function selectPartner(rosterId: number) {
    setPartnerRosterId(rosterId);
    setReceiveIds([]);
  }

  function changePartner() {
    setPartnerRosterId(null);
    setReceiveIds([]);
  }

  function addPlayer(side: Side, sleeperId: string) {
    if (side === "give") setGiveIds((ids) => [...ids, sleeperId]);
    else setReceiveIds((ids) => [...ids, sleeperId]);
  }

  function removePlayer(side: Side, sleeperId: string) {
    if (side === "give") setGiveIds((ids) => ids.filter((id) => id !== sleeperId));
    else setReceiveIds((ids) => ids.filter((id) => id !== sleeperId));
  }

  // Replaces the partner and both sides outright rather than appending — a
  // suggestion is a complete trade (including who it's with), so merging it
  // into whatever was already staged would produce something the finder
  // never actually evaluated.
  function loadTrade(
    nextPartnerRosterId: number,
    nextGiveIds: string[],
    nextReceiveIds: string[]
  ) {
    setPartnerRosterId(nextPartnerRosterId);
    setGiveIds(nextGiveIds);
    setReceiveIds(nextReceiveIds);
  }

  const giveTotal = sumValues(giveIds, playersById);
  const receiveTotal = sumValues(receiveIds, playersById);
  const diff = receiveTotal - giveTotal;
  const hasPlayers = giveIds.length > 0 && receiveIds.length > 0;

  const [odds, setOdds] = useState<TradeOddsDiff | null>(null);
  const [oddsError, setOddsError] = useState(false);
  const [isOddsPending, startOddsTransition] = useTransition();
  const oddsRequestId = useRef(0);
  // Bumped by the "Try again" link below on a failed fetch — included in
  // the effect's deps purely to re-trigger it without changing any of the
  // actual trade inputs.
  const [oddsRetryKey, setOddsRetryKey] = useState(0);

  useEffect(() => {
    // No playoff-odds simulation exists for a manual league (no real
    // schedule/scoring data to run it against) — odds/isOddsPending/
    // oddsError all just stay at their initial falsy values, and the
    // verdict below is computed from trade value alone instead.
    if (manual) return;

    const requestId = ++oddsRequestId.current;
    startOddsTransition(async () => {
      if (!selectedRosterId || !hasPlayers) {
        setOdds(null);
        setOddsError(false);
        return;
      }
      try {
        const result = await getOddsForTrade(leagueId, selectedRosterId, giveIds, receiveIds);
        // A newer request may have started (and resolved) while this one
        // was in flight — ignore this response so a stale result can't
        // overwrite a fresher one.
        if (requestId === oddsRequestId.current) {
          setOdds(result);
          setOddsError(false);
        }
      } catch {
        if (requestId === oddsRequestId.current) {
          setOdds(null);
          setOddsError(true);
        }
      }
    });
  }, [
    leagueId,
    manual,
    selectedRosterId,
    giveIds,
    receiveIds,
    hasPlayers,
    startOddsTransition,
    oddsRetryKey,
  ]);

  // Independent of the odds effect above — SOS is an awareness signal, not
  // something the verdict depends on, so it shouldn't block on or be
  // blocked by the playoff-odds simulation.
  const [sosByPlayer, setSosByPlayer] = useState<Map<string, PlayerSos>>(new Map());
  const [, startSosTransition] = useTransition();
  const sosRequestId = useRef(0);

  useEffect(() => {
    const requestId = ++sosRequestId.current;
    startSosTransition(async () => {
      const requestPlayers = Array.from(selectedIds).flatMap((id) => {
        const player = playersById.get(id);
        return player
          ? [{ sleeperId: player.sleeperId, position: player.position, team: player.team }]
          : [];
      });
      if (requestPlayers.length === 0) {
        if (requestId === sosRequestId.current) setSosByPlayer(new Map());
        return;
      }
      try {
        const result = await getTradeSos(leagueId, requestPlayers);
        // A newer request may have started (and resolved) while this one
        // was in flight — ignore this response so a stale result can't
        // overwrite a fresher one.
        if (requestId === sosRequestId.current) setSosByPlayer(result);
      } catch {
        if (requestId === sosRequestId.current) setSosByPlayer(new Map());
      }
    });
  }, [leagueId, selectedIds, playersById, startSosTransition]);

  const verdict = useMemo(() => {
    if (!selectedTeam || !hasPlayers) return null;
    if (manual) {
      return computeManualTradeVerdict({ diff, giveIds, receiveIds, playersById });
    }
    if (!odds) return null;
    return computeTradeVerdict({ diff, odds, team: selectedTeam, giveIds, receiveIds, playersById });
  }, [selectedTeam, hasPlayers, manual, odds, diff, giveIds, receiveIds, playersById]);

  const [shareStatus, setShareStatus] = useState<"idle" | "copied">("idle");

  // Only ever runs from the button's onClick below — never automatically.
  // Freezes everything simulation/value-derived at this exact moment (odds,
  // diff, trade label, the full verdict) by reusing what's already resolved
  // in state, rather than letting the shared link re-derive its own numbers
  // on every future page load — see lib/verdict-share.ts.
  async function handleShare() {
    if (!selectedTeam || !odds || !verdict) return;

    const receivePlayers = receiveIds
      .map((id) => playersById.get(id))
      .filter((player): player is TradeablePlayer => player !== undefined);
    const tradeLabel = getTradeLabel(diff, odds.after - odds.before, receivePlayers);

    const code = encodeVerdict({
      leagueId,
      rosterId: selectedTeam.rosterId,
      give: giveIds.map((id) => ({ sleeperId: id, value: playersById.get(id)?.value ?? 0 })),
      receive: receiveIds.map((id) => ({ sleeperId: id, value: playersById.get(id)?.value ?? 0 })),
      diff,
      odds,
      tradeLabel,
      team: { bucket: selectedTeam.bucket, thinPositions: selectedTeam.thinPositions },
      verdict,
    });
    const url = `${window.location.origin}/trade/verdict/${code}`;

    // Copy to the clipboard unconditionally first, so a usable link always
    // ends up somewhere the user can reach it — navigator.share() exists on
    // most desktop Chrome/Edge builds but opens a native sheet with nothing
    // configured to receive it, and silently does nothing if the user just
    // closes it. The native share sheet below is offered as a bonus on top
    // of the guaranteed clipboard copy, not instead of it.
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus("copied");
      setTimeout(() => setShareStatus("idle"), 2000);
    } catch {
      // Clipboard write can fail (permissions, insecure context) — the
      // native share sheet below is still a valid path if it's available.
    }

    if (navigator.share) {
      try {
        await navigator.share({ title: "Trade Verdict", url });
      } catch {
        // Dismissed or unsupported — the clipboard copy above already
        // covered it.
      }
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <TeamHeader
        teams={teams}
        selectedTeam={selectedTeam}
        isAutoDetected={storedRosterId !== null}
        onSelectSessionTeam={setSessionRosterId}
      />

      {/* Sleeper-only: the finder confirms candidates against the playoff-odds
          simulation, and a manual league has no schedule to simulate. */}
      {!manual && (
        <TradeFinderPanel
          leagueId={leagueId}
          onLoadTrade={loadTrade}
          rosterId={selectedRosterId}
        />
      )}

      <div className="flex flex-col gap-3">
        {selectedTeam && hasPlayers && verdict ? (
          <>
            <TeamContextLine team={selectedTeam} verdict={verdict} />
            {/* No real before/after odds for a manual league — the
                verdict headline above already speaks to value alone. */}
            {!manual && odds && (
              <OddsDiffLine odds={odds} tone={verdict.tone} isPending={isOddsPending} />
            )}
          </>
        ) : (
          selectedTeam &&
          hasPlayers &&
          isOddsPending && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-4 w-52" />
            </div>
          )
        )}

        <Verdict
          verdict={verdict}
          hasPlayers={hasPlayers}
          isPending={isOddsPending}
          hasError={oddsError}
          onRetry={() => setOddsRetryKey((key) => key + 1)}
        />

        {selectedTeam && hasPlayers && odds && verdict && (
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share2 />
              Share
            </Button>
            {shareStatus === "copied" && (
              <span className="text-sm text-muted-foreground">Link copied!</span>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <TradeColumn
          title="You Give"
          side="give"
          players={rosterPlayers}
          selectedIds={selectedIds}
          sideIds={giveIds}
          playersById={playersById}
          sosByPlayer={sosByPlayer}
          total={giveTotal}
          onAdd={(id) => addPlayer("give", id)}
          onRemove={(id) => removePlayer("give", id)}
          showRoster
          rosterLabel="Your Roster"
          disabledMessage={
            !selectedTeam ? "Select your team above to see your roster." : undefined
          }
        />
        <TradeColumn
          title="You Receive"
          side="receive"
          players={partnerRosterPlayers}
          selectedIds={selectedIds}
          sideIds={receiveIds}
          playersById={playersById}
          sosByPlayer={sosByPlayer}
          total={receiveTotal}
          onAdd={(id) => addPlayer("receive", id)}
          onRemove={(id) => removePlayer("receive", id)}
          showRoster
          rosterLabel="Their Roster"
          rosterEmptyMessage="All of their tradeable players are already in this trade."
          disabledMessage={
            !partnerTeam ? "Select a partner team above to see their roster." : undefined
          }
          headerExtra={
            <PartnerPicker
              teams={teams}
              excludeRosterId={selectedRosterId}
              partnerTeam={partnerTeam}
              onChange={changePartner}
              onSelect={selectPartner}
            />
          }
        />
      </div>
    </div>
  );
}

function sumValues(ids: string[], playersById: Map<string, TradeablePlayer>): number {
  return ids.reduce((sum, id) => sum + (playersById.get(id)?.value ?? 0), 0);
}

function TeamHeader({
  teams,
  selectedTeam,
  isAutoDetected,
  onSelectSessionTeam,
}: {
  teams: TeamContext[];
  selectedTeam: TeamContext | undefined;
  isAutoDetected: boolean;
  onSelectSessionTeam: (rosterId: number | null) => void;
}) {
  if (selectedTeam) {
    return (
      <div className="flex items-center justify-between rounded-lg border px-4 py-3">
        <div>
          <p className="font-medium">{selectedTeam.teamName}</p>
          <p className="text-sm text-muted-foreground">{selectedTeam.record}</p>
        </div>
        {!isAutoDetected && (
          <span className="text-xs text-muted-foreground">This session only</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border px-4 py-3">
      <label className="text-sm font-medium" htmlFor="trade-team-select">
        Select your team (for this session only)
      </label>
      <select
        className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        defaultValue=""
        id="trade-team-select"
        onChange={(event) =>
          onSelectSessionTeam(event.target.value ? Number(event.target.value) : null)
        }
      >
        <option disabled value="">
          Choose a team…
        </option>
        {teams.map((team) => (
          <option key={team.rosterId} value={team.rosterId}>
            {team.teamName} — {team.ownerName}
          </option>
        ))}
      </select>
    </div>
  );
}

const BUCKET_GOAL: Record<PlayoffBucket, string> = {
  "Playoff Favorite": "locking up a top playoff seed",
  "Playoff Contender": "making the playoffs",
  "Playoff Hopeful": "a late push",
};

export function TeamContextLine({
  team,
  verdict,
}: {
  team: TeamContext;
  verdict: TradeVerdict;
}) {
  const thinSuffix =
    team.thinPositions.length > 0 ? ` thin at ${team.thinPositions.join("/")}` : "";

  return (
    <p className="text-sm text-muted-foreground">
      As a {team.bucket}
      {thinSuffix}, this trade{" "}
      <span
        className={
          verdict.helps
            ? "font-medium text-emerald-600 dark:text-emerald-400"
            : "font-medium text-red-600 dark:text-red-400"
        }
      >
        {verdict.helps ? "helps" : "hurts"}
      </span>{" "}
      your path to {BUCKET_GOAL[team.bucket]}.
    </p>
  );
}

export function OddsDiffLine({
  odds,
  tone,
  isPending,
}: {
  odds: TradeOddsDiff;
  tone: VerdictTone;
  isPending: boolean;
}) {
  const beforePct = odds.before * 100;
  const afterPct = odds.after * 100;
  const deltaPct = afterPct - beforePct;
  const toneClass =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "negative"
        ? "text-red-600 dark:text-red-400"
        : "text-foreground";

  return (
    <p className="text-sm text-muted-foreground">
      Playoff odds:{" "}
      <span className="font-medium tabular-nums text-foreground">
        {beforePct.toFixed(1)}%
      </span>{" "}
      →{" "}
      <span className={`font-medium tabular-nums ${toneClass}`}>
        {afterPct.toFixed(1)}%
      </span>{" "}
      <span className={`tabular-nums ${tone === "neutral" ? "text-muted-foreground" : toneClass}`}>
        ({deltaPct >= 0 ? "+" : ""}
        {deltaPct.toFixed(1)} percent)
      </span>
      {isPending && <span className="text-xs text-muted-foreground"> (updating…)</span>}
    </p>
  );
}

export function Verdict({
  verdict,
  hasPlayers,
  isPending,
  hasError = false,
  onRetry,
}: {
  verdict: TradeVerdict | null;
  hasPlayers: boolean;
  isPending: boolean;
  hasError?: boolean;
  onRetry?: () => void;
}) {
  let headline: string;
  let tone: VerdictTone;

  if (!hasPlayers) {
    headline = "Add players to both sides to see the verdict.";
    tone = "neutral";
  } else if (verdict) {
    headline = verdict.headline;
    tone = verdict.tone;
  } else {
    headline = isPending
      ? "Calculating playoff odds…"
      : "Couldn't calculate playoff odds for this trade.";
    tone = "neutral";
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Verdict
        </p>
        <p
          className={`flex items-center gap-2 text-2xl font-semibold ${
            tone === "positive"
              ? "text-emerald-600 dark:text-emerald-400"
              : tone === "negative"
                ? "text-red-600 dark:text-red-400"
                : "text-foreground"
          }`}
        >
          {isPending && !verdict && (
            <Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" />
          )}
          {headline}
        </p>
        {hasError && !verdict && onRetry && (
          <button
            type="button"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            onClick={onRetry}
          >
            Try again
          </button>
        )}
        {verdict && (
          <p className="text-sm text-muted-foreground">{verdict.valueCaption}</p>
        )}
        {verdict && verdict.showValueOddsMismatch && (
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            Big value gap, small odds impact? That&apos;s not a bug. Trade value reflects
            long-term worth, but playoff odds compare against your best realistic
            replacement at that spot — if what you already had there was good enough,
            swapping in someone worth more won&apos;t move the needle much this season.
          </p>
        )}
        {verdict && verdict.cautions.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {verdict.cautions.map((caution, index) => (
              <p key={index} className="max-w-sm text-xs text-amber-600 dark:text-amber-400">
                {caution}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TradeColumn({
  title,
  side,
  players,
  selectedIds,
  sideIds,
  playersById,
  sosByPlayer,
  total,
  onAdd,
  onRemove,
  showRoster,
  rosterLabel,
  rosterEmptyMessage,
  disabledMessage,
  headerExtra,
}: {
  title: string;
  side: Side;
  players: TradeablePlayer[];
  selectedIds: Set<string>;
  sideIds: string[];
  playersById: Map<string, TradeablePlayer>;
  sosByPlayer: Map<string, PlayerSos>;
  total: number;
  onAdd: (sleeperId: string) => void;
  onRemove: (sleeperId: string) => void;
  showRoster?: boolean;
  rosterLabel?: string;
  rosterEmptyMessage?: string;
  disabledMessage?: string;
  // Rendered inside the card header below the title row, always visible
  // regardless of disabledMessage — the receive side's partner picker needs
  // to stay reachable even before a partner (and so a roster) exists.
  headerExtra?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{title}</CardTitle>
          <span className="text-lg font-semibold tabular-nums">
            {total.toLocaleString()}
          </span>
        </div>
        {headerExtra}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          {sideIds.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No players added
            </p>
          )}
          {sideIds.map((id) => {
            const player = playersById.get(id);
            if (!player) return null;
            const sos = sosByPlayer.get(id);
            const nearTermNote = sos
              ? formatNearTermTradeNote(side, sos.nearTerm.tier)
              : undefined;
            return (
              <div key={id} className="flex flex-col gap-1.5 rounded-lg border px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{player.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {player.position} · {player.team ?? "FA"}
                    </p>
                  </div>
                  {sos && <SosTierBadge window={sos.seasonLong} />}
                  <span className="text-sm font-medium tabular-nums">
                    {player.value.toLocaleString()}
                  </span>
                  <button
                    aria-label={`Remove ${player.name}`}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => onRemove(id)}
                    type="button"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                {nearTermNote && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">{nearTermNote}</p>
                )}
              </div>
            );
          })}
        </div>

        {disabledMessage ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {disabledMessage}
          </p>
        ) : (
          <>
            {showRoster && (
              <RosterGrid
                players={players}
                selectedIds={selectedIds}
                sideIds={sideIds}
                onAdd={onAdd}
                onRemove={onRemove}
                label={rosterLabel}
                emptyMessage={rosterEmptyMessage}
              />
            )}
            <PlayerPicker players={players} excludeIds={selectedIds} onSelect={onAdd} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Lives in "You Receive"'s card header rather than beside the top-level
// TeamHeader — a trade partner is specific to that one column, unlike "my
// team" which the whole page (including the give side and the odds/verdict
// calculation) depends on.
function PartnerPicker({
  teams,
  excludeRosterId,
  partnerTeam,
  onSelect,
  onChange,
}: {
  teams: TeamContext[];
  excludeRosterId: number | null;
  partnerTeam: TeamContext | undefined;
  onSelect: (rosterId: number) => void;
  onChange: () => void;
}) {
  if (partnerTeam) {
    return (
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs text-muted-foreground">
          Trading with{" "}
          <span className="font-medium text-foreground">{partnerTeam.teamName}</span>
        </p>
        <button
          className="shrink-0 text-xs font-medium text-primary underline-offset-4 hover:underline"
          onClick={onChange}
          type="button"
        >
          Change
        </button>
      </div>
    );
  }

  const options = teams.filter((team) => team.rosterId !== excludeRosterId);

  return (
    <select
      aria-label="Choose a team to trade with"
      className="h-9 w-full rounded-lg border bg-background px-3 text-xs outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      defaultValue=""
      onChange={(event) => {
        if (event.target.value) onSelect(Number(event.target.value));
      }}
    >
      <option disabled value="">
        Choose a team to trade with…
      </option>
      {options.map((team) => (
        <option key={team.rosterId} value={team.rosterId}>
          {team.teamName} — {team.ownerName}
        </option>
      ))}
    </select>
  );
}

function RosterGrid({
  players,
  selectedIds,
  sideIds,
  onAdd,
  onRemove,
  label = "Your Roster",
  emptyMessage = "All your tradeable players are already in this trade.",
}: {
  players: TradeablePlayer[];
  // Cross-side set (give + receive) — a player already picked for the
  // *other* side stays hidden here, same as before, to avoid the
  // nonsensical "trade yourself your own player" case.
  selectedIds: Set<string>;
  // This side's own picks, in selection order — drives both the top-of-
  // list sort and the highlighted/selected look, so a click's effect is
  // visible immediately without scrolling to a separate section.
  sideIds: string[];
  onAdd: (sleeperId: string) => void;
  onRemove: (sleeperId: string) => void;
  // Parametrized so this same grid can browse either side's roster — "Your
  // Roster" for what you're giving, "Their Roster" for the selected trade
  // partner's players you might receive.
  label?: string;
  emptyMessage?: string;
}) {
  const sideIdSet = useMemo(() => new Set(sideIds), [sideIds]);

  const ordered = useMemo(() => {
    const eligible = players.filter(
      (player) => sideIdSet.has(player.sleeperId) || !selectedIds.has(player.sleeperId)
    );

    // Most-recently-selected first, so whichever player was just clicked
    // jumps to the very top of the list instead of the user having to
    // scroll to confirm the click registered.
    const selected = [...sideIds]
      .reverse()
      .map((id) => eligible.find((player) => player.sleeperId === id))
      .filter((player): player is TradeablePlayer => player !== undefined);
    const unselected = eligible
      .filter((player) => !sideIdSet.has(player.sleeperId))
      .sort((a, b) => b.value - a.value);

    return [...selected, ...unselected];
  }, [players, sideIds, sideIdSet, selectedIds]);

  if (ordered.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <div className="flex flex-col gap-2">
        {ordered.map((player) => {
          const isSelected = sideIdSet.has(player.sleeperId);
          return (
            <button
              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                isSelected
                  ? "border-primary/50 bg-primary/5"
                  : "hover:bg-muted"
              }`}
              key={player.sleeperId}
              onClick={() =>
                isSelected ? onRemove(player.sleeperId) : onAdd(player.sleeperId)
              }
              type="button"
            >
              <span className="min-w-0 flex-1 truncate">
                {player.name}{" "}
                <span className="text-xs text-muted-foreground">
                  {player.position} · {player.team ?? "FA"}
                </span>
              </span>
              {isSelected && <Check aria-hidden="true" className="size-4 shrink-0 text-primary" />}
              <Badge variant="outline">{player.value.toLocaleString()}</Badge>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PlayerPicker({
  players,
  excludeIds,
  onSelect,
}: {
  players: TradeablePlayer[];
  excludeIds: Set<string>;
  onSelect: (sleeperId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());

  const matches = useMemo(() => {
    if (deferredQuery.length === 0) return [];
    return players
      .filter(
        (player) =>
          !excludeIds.has(player.sleeperId) &&
          player.name.toLocaleLowerCase().includes(deferredQuery)
      )
      .slice(0, RESULT_LIMIT);
  }, [players, excludeIds, deferredQuery]);

  return (
    <div className="relative">
      <label className="relative block">
        <span className="sr-only">Search players to add</span>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          autoComplete="off"
          className="h-10 w-full rounded-lg border bg-background pr-4 pl-10 text-sm shadow-xs outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search players to add…"
          type="search"
          value={query}
        />
      </label>

      {matches.length > 0 && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-md">
          {matches.map((player) => (
            <button
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
              key={player.sleeperId}
              onClick={() => {
                onSelect(player.sleeperId);
                setQuery("");
              }}
              type="button"
            >
              <span className="min-w-0 flex-1 truncate">
                {player.name}{" "}
                <span className="text-xs text-muted-foreground">
                  {player.position} · {player.team ?? "FA"}
                </span>
              </span>
              <Badge variant="outline">{player.value.toLocaleString()}</Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
