"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UpgradePrompt } from "@/components/upgrade-prompt";
import { addSleeperLeague } from "@/lib/add-league-action";
import {
  LAST_LEAGUE_STORAGE_KEY,
  parseLastLeague,
  rememberLastLeague,
} from "@/lib/last-league";

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
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [isPending, startTransition] = useTransition();

  const storedRaw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const lastLeague = parseLastLeague(storedRaw);

  function goToLeague(id: string, name: string) {
    rememberLastLeague(id, name);
    router.push(`/${id}`);
  }

  function submitLeagueId() {
    const trimmed = leagueId.trim();
    if (!trimmed) {
      setError("Enter a league ID.");
      return;
    }
    setError(null);
    setQuotaExceeded(false);
    startTransition(async () => {
      const result = await addSleeperLeague(trimmed);
      if (!result.ok || !result.leagueName) {
        setError(result.error ?? "Couldn't find that league.");
        setQuotaExceeded(result.quotaExceeded ?? false);
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
              <p className="font-heading text-xs font-medium tracking-wide text-muted-foreground uppercase">
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

        {error && !quotaExceeded && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <Button disabled={isPending} type="submit">
          {isPending ? "Checking…" : "Continue"}
        </Button>
      </form>

      {quotaExceeded && <UpgradePrompt />}

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have a Sleeper league?{" "}
        <Link href="/start/espn" className="underline underline-offset-2 hover:text-foreground">
          Connect an ESPN league
        </Link>{" "}
        or{" "}
        <Link href="/start/manual" className="underline underline-offset-2 hover:text-foreground">
          enter one manually
        </Link>
      </p>
    </div>
  );
}
