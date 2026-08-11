"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { UpgradePrompt } from "@/components/upgrade-prompt";
import { addEspnLeague } from "@/lib/add-league-action";
import { rememberLastLeague } from "@/lib/last-league";

export function EspnLeagueEntry({ defaultSeason }: { defaultSeason: number }) {
  const router = useRouter();
  const [leagueId, setLeagueId] = useState("");
  const [season, setSeason] = useState(String(defaultSeason));
  const [error, setError] = useState<string | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit() {
    const trimmed = leagueId.trim();
    if (!trimmed) {
      setError("Enter a league ID.");
      return;
    }
    setError(null);
    setQuotaExceeded(false);
    startTransition(async () => {
      const result = await addEspnLeague(trimmed, Number(season));
      if (!result.ok || !result.leagueId || !result.leagueName) {
        setError(result.error ?? "Couldn't find that league.");
        setQuotaExceeded(result.quotaExceeded ?? false);
        return;
      }
      // The app-level ID comes back from the server rather than being built
      // here — it encodes the season and a source prefix (see
      // lib/espn-league.ts), which the client has no business reconstructing.
      rememberLastLeague(result.leagueId, result.leagueName);
      router.push(`/${result.leagueId}`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">ESPN league ID</span>
          <input
            autoComplete="off"
            className="h-11 w-full rounded-lg border bg-background px-3 text-sm shadow-xs outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            inputMode="numeric"
            onChange={(event) => setLeagueId(event.target.value)}
            placeholder="e.g. 1241838"
            type="text"
            value={leagueId}
          />
          <span className="text-xs text-muted-foreground">
            Find it in your league&apos;s URL on ESPN: the{" "}
            <code className="font-mono">leagueId=</code> value.
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Season</span>
          <input
            autoComplete="off"
            className="h-11 w-full rounded-lg border bg-background px-3 text-sm shadow-xs outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            inputMode="numeric"
            onChange={(event) => setSeason(event.target.value)}
            type="text"
            value={season}
          />
        </label>

        {error && !quotaExceeded && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <Button disabled={isPending} type="submit">
          {isPending ? "Checking…" : "Connect league"}
        </Button>
      </form>

      {quotaExceeded && <UpgradePrompt />}

      <p className="text-center text-sm text-muted-foreground">
        Your ESPN league must be public — no ESPN login is needed. Private leagues
        aren&apos;t supported yet.
      </p>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/start" className="underline underline-offset-2 hover:text-foreground">
          Use a Sleeper league instead
        </Link>
      </p>
    </div>
  );
}
