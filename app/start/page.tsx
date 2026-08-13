import Link from "next/link";

import { LeagueEntry } from "@/components/league-entry";
import { requireUser } from "@/lib/auth/dal";

export default async function Home() {
  // League entry now attaches the league to an account, so it needs one.
  // Sleeper league *pages* stay publicly viewable — only this entry flow and
  // manual leagues require signing in.
  await requireUser();

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="flex w-full max-w-md flex-col gap-8">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Front Office</h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Enter your Sleeper league ID to get started.
          </p>
        </div>

        <LeagueEntry />

        <Link
          className="text-center text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          href="/account"
        >
          Account settings
        </Link>
      </div>
    </div>
  );
}
