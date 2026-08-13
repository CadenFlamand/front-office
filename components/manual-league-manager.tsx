"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { PlayerSummary } from "@/app/[leagueId]/players/data";
import {
  addManualPlayer,
  addManualTeam,
  deleteManualTeam,
  removeManualPlayer,
  renameManualTeam,
  updateManualTeamRecord,
  type ManualTeam,
} from "@/lib/db/manual-leagues";

export interface ManualTeamWithRoster extends ManualTeam {
  playerIds: string[];
}

// The one edit surface for a manual league — add/rename/delete teams, W-L-T
// records, and roster add/remove, all in one place rather than a separate
// creation wizard, since a brand-new league starts here with zero teams
// anyway. Every mutation just calls its server action then router.refresh()
// to reload this page's server-fetched props — simpler than hand-rolling
// optimistic local state for half a dozen different mutation shapes, and
// fine for a low-frequency admin page like this.
export function ManualLeagueManager({
  leagueId,
  leagueName,
  teams,
  players,
}: {
  leagueId: string;
  leagueName: string;
  teams: ManualTeamWithRoster[];
  players: PlayerSummary[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newTeamName, setNewTeamName] = useState("");
  const playersById = new Map(players.map((player) => [player.id, player]));

  function refresh() {
    startTransition(() => router.refresh());
  }

  function handleAddTeam() {
    const name = newTeamName.trim();
    if (!name) return;
    startTransition(async () => {
      await addManualTeam(leagueId, name);
      setNewTeamName("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{leagueName}</h1>
        <p className="text-sm text-muted-foreground">
          Manual league — add teams, assign real players, and keep records up to date by hand.
        </p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          handleAddTeam();
        }}
      >
        <input
          className="h-10 flex-1 rounded-lg border bg-background px-3 text-sm shadow-xs outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          onChange={(event) => setNewTeamName(event.target.value)}
          placeholder="New team name"
          value={newTeamName}
        />
        <Button disabled={isPending || newTeamName.trim().length === 0} type="submit">
          Add team
        </Button>
      </form>

      {teams.length === 0 ? (
        <p className="rounded-lg border py-8 text-center text-sm text-muted-foreground">
          No teams yet — add your first one above.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {teams.map((team) => (
            <ManualTeamCard
              key={team.id}
              team={team}
              players={players}
              playersById={playersById}
              onChanged={refresh}
            />
          ))}
        </div>
      )}

      {teams.length > 0 && (
        <Button nativeButton={false} render={<Link href={`/${leagueId}`} />} variant="outline">
          Done — go to dashboard
        </Button>
      )}
    </div>
  );
}

function ManualTeamCard({
  team,
  players,
  playersById,
  onChanged,
}: {
  team: ManualTeamWithRoster;
  players: PlayerSummary[];
  playersById: Map<string, PlayerSummary>;
  onChanged: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(team.teamName);
  const [wins, setWins] = useState(String(team.wins));
  const [losses, setLosses] = useState(String(team.losses));
  const [ties, setTies] = useState(String(team.ties));

  function saveName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === team.teamName) {
      setName(team.teamName);
      return;
    }
    startTransition(async () => {
      await renameManualTeam(team.id, trimmed);
      onChanged();
    });
  }

  function saveRecord() {
    startTransition(async () => {
      await updateManualTeamRecord(
        team.id,
        Number(wins) || 0,
        Number(losses) || 0,
        Number(ties) || 0
      );
      onChanged();
    });
  }

  function handleDeleteTeam() {
    if (!window.confirm(`Remove ${team.teamName}? This can't be undone.`)) return;
    startTransition(async () => {
      await deleteManualTeam(team.id);
      onChanged();
    });
  }

  function handleAddPlayer(playerId: string) {
    startTransition(async () => {
      await addManualPlayer(team.id, playerId);
      onChanged();
    });
  }

  function handleRemovePlayer(playerId: string) {
    startTransition(async () => {
      await removeManualPlayer(team.id, playerId);
      onChanged();
    });
  }

  const excludeIds = new Set(team.playerIds);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-2.5 text-sm font-medium shadow-xs outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            onBlur={saveName}
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
          <Button
            className="shrink-0"
            disabled={isPending}
            onClick={handleDeleteTeam}
            size="sm"
            variant="outline"
          >
            Delete team
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-end gap-2">
          <RecordField label="W" value={wins} onChange={setWins} />
          <RecordField label="L" value={losses} onChange={setLosses} />
          <RecordField label="T" value={ties} onChange={setTies} />
          <Button disabled={isPending} onClick={saveRecord} size="sm" variant="outline">
            Save record
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          <p className="font-heading text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Roster ({team.playerIds.length})
          </p>
          {team.playerIds.length === 0 ? (
            <p className="text-sm text-muted-foreground">No players yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {team.playerIds.map((playerId) => {
                const player = playersById.get(playerId);
                return (
                  <li
                    key={playerId}
                    className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                  >
                    <span className="truncate">
                      {player?.name ?? playerId}{" "}
                      <span className="text-xs text-muted-foreground">
                        {player?.position ?? "?"}
                      </span>
                    </span>
                    <button
                      aria-label={`Remove ${player?.name ?? playerId}`}
                      className="text-muted-foreground transition-colors hover:text-foreground"
                      onClick={() => handleRemovePlayer(playerId)}
                      type="button"
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <ManualPlayerPicker players={players} excludeIds={excludeIds} onSelect={handleAddPlayer} />
      </CardContent>
    </Card>
  );
}

function RecordField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground uppercase">{label}</span>
      <input
        className="h-9 w-14 rounded-lg border bg-background px-2 text-sm shadow-xs outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        inputMode="numeric"
        onChange={(event) => onChange(event.target.value.replace(/[^0-9]/g, ""))}
        value={value}
      />
    </label>
  );
}

const RESULT_LIMIT = 8;

function ManualPlayerPicker({
  players,
  excludeIds,
  onSelect,
}: {
  players: PlayerSummary[];
  excludeIds: Set<string>;
  onSelect: (playerId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const trimmedQuery = query.trim().toLocaleLowerCase();

  const matches =
    trimmedQuery.length === 0
      ? []
      : players
          .filter(
            (player) => !excludeIds.has(player.id) && player.name.toLocaleLowerCase().includes(trimmedQuery)
          )
          .slice(0, RESULT_LIMIT);

  return (
    <div className="relative">
      <input
        className="h-10 w-full rounded-lg border bg-background px-3 text-sm shadow-xs outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search players to add…"
        type="search"
        value={query}
      />
      {matches.length > 0 && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-md">
          {matches.map((player) => (
            <button
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
              key={player.id}
              onClick={() => {
                onSelect(player.id);
                setQuery("");
              }}
              type="button"
            >
              <span className="truncate">{player.name}</span>
              <span className="text-xs text-muted-foreground">
                {player.position ?? "?"} · {player.team ?? "FA"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
