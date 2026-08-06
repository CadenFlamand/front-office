import { notFound } from "next/navigation";

import { WaiverPicks } from "@/components/waiver-picks";
import { Separator } from "@/components/ui/separator";
import { isNotFound } from "@/lib/http";
import { isManualLeagueId } from "@/lib/manual-league";
import { getTeamContexts } from "@/lib/team-context";

export const metadata = {
  title: "Waiver Pickups | Front Office",
};

export default async function WaiversPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;

  if (isManualLeagueId(leagueId)) {
    return (
      <div className="flex flex-1 flex-col items-center bg-zinc-50 px-6 py-16 dark:bg-black">
        <div className="flex w-full max-w-2xl flex-col gap-8">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">Waiver Pickups</h1>
            <p className="text-zinc-600 dark:text-zinc-400">Not available for manual leagues.</p>
          </div>
          <Separator />
          <p className="rounded-lg border py-10 text-center text-sm text-muted-foreground">
            The waiver wire is a real, whole-league concept — who&apos;s on someone
            else&apos;s live roster right now — that a manually-entered league has no
            equivalent for. Connect a Sleeper league to unlock this.
          </p>
        </div>
      </div>
    );
  }

  let teams;
  try {
    ({ teams } = await getTeamContexts(leagueId));
  } catch (error) {
    if (isNotFound(error)) notFound();
    throw error;
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="flex w-full max-w-2xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Waiver Pickups</h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Best available players, powered by FantasyPros&apos; waiver-wire consensus
            ranking.
          </p>
        </div>

        <Separator />

        <WaiverPicks leagueId={leagueId} teams={teams} />
      </div>
    </div>
  );
}
