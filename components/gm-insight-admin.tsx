"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  createGmInsightAction,
  deleteGmInsightAction,
  searchPlayersAction,
  setGmInsightActiveAction,
  updateGmInsightAction,
  type GmInsightWithPlayerName,
  type PlayerSearchResult,
} from "@/lib/gm-insights-action";

// The one admin surface for GM Insight authoring — add/edit/delete/retire,
// all in one place. Every mutation calls its server action then
// router.refresh() to reload the server-fetched list, same low-frequency
// admin-page convention as ManualLeagueManager rather than hand-rolled
// optimistic local state.
export function GmInsightAdmin({ insights }: { insights: GmInsightWithPlayerName[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<GmInsightWithPlayerName | null>(null);

  function refresh() {
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-8">
      <GmInsightForm
        key={editing?.id ?? "new"}
        editing={editing}
        onCancelEdit={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refresh();
        }}
      />

      {insights.length === 0 ? (
        <p className="rounded-lg border py-8 text-center text-sm text-muted-foreground">
          No insights yet — add your first one above.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {insights.map((insight) => (
            <GmInsightRow
              key={insight.id}
              insight={insight}
              onEdit={() => setEditing(insight)}
              onChanged={refresh}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function GmInsightForm({
  editing,
  onCancelEdit,
  onSaved,
}: {
  editing: GmInsightWithPlayerName | null;
  onCancelEdit: () => void;
  onSaved: () => void;
}) {
  const [content, setContent] = useState(editing?.content ?? "");
  const [player, setPlayer] = useState<PlayerSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Editing an existing player-specific insight: we only have the raw
  // player_id + resolved name from the list query, not a full
  // PlayerSearchResult — enough to display and to keep sending the same ID
  // if the admin doesn't touch the player field.
  const [editingPlayerId, setEditingPlayerId] = useState(editing?.playerId ?? null);

  function submit() {
    setError(null);
    const trimmed = content.trim();
    if (!trimmed) {
      setError("Content can't be empty.");
      return;
    }
    const playerId = player ? player.playerId : editingPlayerId;
    startTransition(async () => {
      const result = editing
        ? await updateGmInsightAction(editing.id, trimmed, playerId)
        : await createGmInsightAction(trimmed, playerId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Editing remounts this form via the parent's key={editing?.id}, but
      // two successive "new insight" submits don't — clear by hand so the
      // form is ready for the next one instead of re-showing what was just
      // submitted.
      setContent("");
      setPlayer(null);
      setEditingPlayerId(null);
      onSaved();
    });
  }

  const selectedPlayerLabel = player?.name ?? (editing?.playerId ? editing.playerName : null);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {editing ? "Edit insight" : "New insight"}
        </p>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Content</span>
          <textarea
            className="min-h-24 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm shadow-xs outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            onChange={(event) => setContent(event.target.value)}
            placeholder="What do you want to tell yourself/others about this?"
            value={content}
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Player (optional)</span>
          <p className="text-xs text-muted-foreground">
            Leave blank for a general/scenario note that isn&apos;t tied to one player.
          </p>
          {selectedPlayerLabel ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
              <span>{selectedPlayerLabel}</span>
              <button
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                onClick={() => {
                  setPlayer(null);
                  setEditingPlayerId(null);
                }}
                type="button"
              >
                Clear
              </button>
            </div>
          ) : (
            <PlayerPicker
              onSelect={(result) => {
                setPlayer(result);
                setEditingPlayerId(result.playerId);
              }}
            />
          )}
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex items-center gap-2">
          <Button disabled={isPending} onClick={submit} type="button">
            {isPending ? "Saving…" : editing ? "Save changes" : "Add insight"}
          </Button>
          {editing && (
            <Button disabled={isPending} onClick={onCancelEdit} type="button" variant="outline">
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const SEARCH_DEBOUNCE_MS = 250;

function PlayerPicker({ onSelect }: { onSelect: (result: PlayerSearchResult) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const requestId = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      if (trimmed.length < 2) {
        setResults([]);
        return;
      }
      const matches = await searchPlayersAction(trimmed);
      if (requestId.current !== id) return; // a newer keystroke's search already landed
      setResults(matches);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="relative">
      <input
        className="h-10 w-full rounded-lg border bg-background px-3 text-sm shadow-xs outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search players…"
        type="search"
        value={query}
      />
      {results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-md">
          {results.map((result) => (
            <button
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
              key={result.playerId}
              onClick={() => {
                onSelect(result);
                setQuery("");
                setResults([]);
              }}
              type="button"
            >
              <span className="truncate">{result.name}</span>
              <span className="text-xs text-muted-foreground">
                {result.position} · {result.team ?? "FA"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function GmInsightRow({
  insight,
  onEdit,
  onChanged,
}: {
  insight: GmInsightWithPlayerName;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  function toggleActive() {
    startTransition(async () => {
      await setGmInsightActiveAction(insight.id, !insight.active);
      onChanged();
    });
  }

  function handleDelete() {
    if (!window.confirm("Delete this insight? This can't be undone.")) return;
    startTransition(async () => {
      await deleteGmInsightAction(insight.id);
      onChanged();
    });
  }

  return (
    <li
      className={`flex flex-col gap-2 rounded-lg border p-4 ${insight.active ? "" : "opacity-60"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          {insight.playerName && (
            <span className="text-xs font-medium tracking-wide text-brand-gold uppercase">
              {insight.playerName}
            </span>
          )}
          <p className="text-sm text-copy-bright">{insight.content}</p>
        </div>
        {!insight.active && (
          <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
            Retired
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button disabled={isPending} onClick={onEdit} size="sm" type="button" variant="outline">
          Edit
        </Button>
        <Button disabled={isPending} onClick={toggleActive} size="sm" type="button" variant="outline">
          {insight.active ? "Retire" : "Reactivate"}
        </Button>
        <Button disabled={isPending} onClick={handleDelete} size="sm" type="button" variant="destructive">
          Delete
        </Button>
      </div>
    </li>
  );
}
