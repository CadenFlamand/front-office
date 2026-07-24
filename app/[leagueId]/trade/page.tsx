import { notFound } from "next/navigation";

import { Separator } from "@/components/ui/separator";
import { getTeamContexts } from "@/lib/team-context";

import { TradeAnalyzer } from "./trade-analyzer";

export const metadata = {
  title: "Trade Analyzer | Front Office",
  description: "Compare trade value between two sides using FantasyCalc.",
};

export default async function TradePage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;

  let teams, values;
  try {
    ({ teams, values } = await getTeamContexts(leagueId));
  } catch {
    notFound();
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10 dark:bg-black sm:px-6 sm:py-16">
      <main className="flex w-full max-w-4xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-muted-foreground">Front Office</p>
          <h1 className="text-3xl font-semibold tracking-tight">Trade Analyzer</h1>
          <p className="max-w-2xl text-zinc-600 dark:text-zinc-400">
            Add players to each side to compare trade value, powered by FantasyCalc.
          </p>
        </div>

        <Separator />

        <TradeAnalyzer players={values} teams={teams} leagueId={leagueId} />
      </main>
    </div>
  );
}
