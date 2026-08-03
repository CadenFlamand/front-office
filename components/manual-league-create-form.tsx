"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createManualLeague } from "@/lib/db/manual-leagues";

const MAX_LEAGUE_NAME_LENGTH = 100;

export function ManualLeagueCreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a league name.");
      return;
    }
    if (trimmed.length > MAX_LEAGUE_NAME_LENGTH) {
      setError(`Keep the league name under ${MAX_LEAGUE_NAME_LENGTH} characters.`);
      return;
    }
    setError(null);
    startTransition(async () => {
      const league = await createManualLeague(trimmed);
      router.push(`/${league.id}/manage`);
    });
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">League name</span>
        <input
          autoComplete="off"
          autoFocus
          className="h-11 w-full rounded-lg border bg-background px-3 text-sm shadow-xs outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. The League of Extraordinary Degenerates"
          type="text"
          value={name}
        />
      </label>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <Button disabled={isPending} type="submit">
        {isPending ? "Creating…" : "Create league"}
      </Button>
    </form>
  );
}
