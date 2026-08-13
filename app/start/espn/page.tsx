import { EspnLeagueEntry } from "@/components/espn-league-entry";
import { requireUser } from "@/lib/auth/dal";

// Sleeper's NFL-state endpoint is the app's existing source of truth for
// "what season is it" (lib/db/snapshot.ts, lib/sos-action.ts and others read
// the same endpoint for the current week). Used here only to prefill the
// season field with something sensible — a failure just means the user picks
// the year themselves, so it falls back rather than erroring the page.
const NFL_STATE_URL = "https://api.sleeper.app/v1/state/nfl";

async function getCurrentSeason(): Promise<number> {
  try {
    const res = await fetch(NFL_STATE_URL, { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error(`Failed to fetch NFL state (${res.status})`);
    const state = (await res.json()) as { season?: string };
    const season = Number(state.season);
    if (Number.isInteger(season) && season > 2000) return season;
  } catch {
    // Fall through to the calendar-based guess below.
  }
  // An NFL season is named for the calendar year it starts in, so anything
  // before March still belongs to the previous season.
  const now = new Date();
  return now.getMonth() >= 2 ? now.getFullYear() : now.getFullYear() - 1;
}

export default async function StartEspnPage() {
  await requireUser();
  const defaultSeason = await getCurrentSeason();

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="flex w-full max-w-md flex-col gap-8">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Connect an ESPN league</h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Public ESPN leagues work with just a league ID — no login required. Playoff
            odds, roster analysis, and the trade tools all work the same as they do for
            Sleeper leagues.
          </p>
        </div>

        <EspnLeagueEntry defaultSeason={defaultSeason} />
      </div>
    </div>
  );
}
