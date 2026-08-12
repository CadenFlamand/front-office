import { notFound } from "next/navigation";

import { BiggestMoversPanel, type MoverRow } from "@/components/biggest-movers-panel";
import { OddsTeamRow } from "@/components/odds-team-row";
import { Separator } from "@/components/ui/separator";
import { getWeekOverWeekOddsMovers } from "@/lib/db/snapshot";
import { isNotFound } from "@/lib/http";
import { isManualLeagueId } from "@/lib/manual-league";
import { getPlayoffOdds } from "@/lib/playoff-odds";

export const metadata = {
  title: "Playoff Odds | Front Office",
};

export default async function OddsPage({
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
            <h1 className="text-3xl font-semibold tracking-tight">Playoff Odds</h1>
            <p className="text-zinc-600 dark:text-zinc-400">Not available for manual leagues.</p>
          </div>

          <Separator />

          <p className="rounded-lg border py-10 text-center text-sm text-muted-foreground">
            Playoff odds need real schedule data — connect a Sleeper league to unlock this.
          </p>
        </div>
      </div>
    );
  }

  let results;
  try {
    results = await getPlayoffOdds(leagueId);
  } catch (error) {
    if (isNotFound(error)) notFound();
    throw error;
  }

  // Built as one string rather than `{results.length} teams · ...` inline —
  // this environment's JSX compiler was observed dropping the space right
  // after a leading expression child in a text run.
  const subtitle = `${results.length} teams · 10,000 simulations`;

  // Team names come from the live results above, not getWeekOverWeekOddsMovers'
  // own snapshot rows — a team that's since been renamed should show its
  // current name here, same as everywhere else on this page.
  const teamNameByRosterId = new Map(results.map((r) => [r.rosterId, r.teamName]));
  const movers = await getWeekOverWeekOddsMovers(leagueId);
  const moverRows: MoverRow[] = movers.flatMap((mover) => {
    const teamName = teamNameByRosterId.get(mover.rosterId);
    return teamName ? [{ ...mover, teamName }] : [];
  });

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-6 py-16 dark:bg-black">
      {/* See app/[leagueId]/page.tsx's identical row for why this is a
          shrink-wrapped (w-fit) flex row centered by the parent's
          items-center, rather than pinning main to its old solo-centered
          position — that put the aside's width entirely on one side and
          dragged the visual center off-axis. */}
      <div className="flex w-full flex-col gap-8 xl:w-fit xl:flex-row xl:items-start xl:gap-10">
        <div className="flex w-full max-w-2xl flex-col gap-8 xl:w-[42rem] xl:max-w-none xl:shrink-0">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">Playoff Odds</h1>
            <p className="text-zinc-600 dark:text-zinc-400">{subtitle}</p>
          </div>

          <Separator />

          <div className="flex flex-col gap-3">
            {results.map((result, index) => (
              <OddsTeamRow
                key={result.rosterId}
                leagueId={leagueId}
                rank={index + 1}
                result={result}
              />
            ))}
          </div>
        </div>

        <aside className="hidden w-80 shrink-0 xl:block">
          <BiggestMoversPanel movers={moverRows} />
        </aside>
      </div>
    </div>
  );
}
