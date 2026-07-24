import { Separator } from "@/components/ui/separator";

import { getPlayers } from "./data";
import { PlayerSearch } from "./player-search";

export const metadata = {
  title: "Players | Front Office",
  description: "Search NFL players by name, position, team, and status.",
};

export default async function PlayersPage() {
  const players = await getPlayers();

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10 dark:bg-black sm:px-6 sm:py-16">
      <main className="flex w-full max-w-4xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-muted-foreground">Front Office</p>
          <h1 className="text-3xl font-semibold tracking-tight">Player search</h1>
          <p className="max-w-2xl text-zinc-600 dark:text-zinc-400">
            Find any NFL player to add to your next trade scenario.
          </p>
        </div>

        <Separator />

        <PlayerSearch players={players} />
      </main>
    </div>
  );
}
