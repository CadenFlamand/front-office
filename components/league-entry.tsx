"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { validateLeagueId } from "@/lib/validate-league";

const LAST_LEAGUE_STORAGE_KEY = "front-office:last-league";

interface LastLeague {
  leagueId: string;
  leagueName: string;
}

function parseLastLeague(raw: string | null): LastLeague | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LastLeague>;
    if (typeof parsed.leagueId === "string" && typeof parsed.leagueName === "string") {
      return { leagueId: parsed.leagueId, leagueName: parsed.leagueName };
    }
  } catch {
    // Ignore malformed stored data.
  }
  return null;
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getSnapshot(): string | null {
  return window.localStorage.getItem(LAST_LEAGUE_STORAGE_KEY);
}

function getServerSnapshot(): string | null {
  return null;
}

export function LeagueEntry() {
  const router = useRouter();
  const [leagueId, setLeagueId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const storedRaw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const lastLeague = parseLastLeague(storedRaw);

  function goToLeague(id: string, name: string) {
    window.localStorage.setItem(
      LAST_LEAGUE_STORAGE_KEY,
      JSON.stringify({ leagueId: id, leagueName: name })
    );
    router.push(`/${id}`);
  }

  function submitLeagueId() {
    const trimmed = leagueId.trim();
    if (!trimmed) {
      setError("Enter a league ID.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await validateLeagueId(trimmed);
      if (!result.ok || !result.leagueName) {
        setError(result.error ?? "Couldn't find that league.");
        return;
      }
      goToLeague(trimmed, result.leagueName);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {lastLeague && (
        <Card
          role="button"
          tabIndex={0}
          onClick={() => goToLeague(lastLeague.leagueId, lastLeague.leagueName)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              goToLeague(lastLeague.leagueId, lastLeague.leagueName);
            }
          }}
          className="cursor-pointer transition-colors hover:bg-muted/50"
        >
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Continue with
              </p>
              <p className="font-medium">{lastLeague.leagueName}</p>
            </div>
            <span aria-hidden="true" className="text-muted-foreground">
              →
            </span>
          </CardContent>
        </Card>
      )}

      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          submitLeagueId();
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Sleeper league ID</span>
          <input
            autoComplete="off"
            className="h-11 w-full rounded-lg border bg-background px-3 text-sm shadow-xs outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            onChange={(event) => setLeagueId(event.target.value)}
            placeholder="e.g. 1385091542758203392"
            type="text"
            value={leagueId}
          />
        </label>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <Button disabled={isPending} type="submit">
          {isPending ? "Checking…" : "Continue"}
        </Button>
      </form>
    </div>
  );
}
