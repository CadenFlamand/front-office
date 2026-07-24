import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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

  let results;
  try {
    results = await getPlayoffOdds(leagueId);
  } catch {
    notFound();
  }

  // Built as one string rather than `{results.length} teams · ...` inline —
  // this environment's JSX compiler was observed dropping the space right
  // after a leading expression child in a text run.
  const subtitle = `${results.length} teams · 10,000 simulations`;

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="flex w-full max-w-2xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Playoff Odds</h1>
          <p className="text-zinc-600 dark:text-zinc-400">{subtitle}</p>
        </div>

        <Separator />

        <div className="flex flex-col gap-3">
          {results.map((result, index) => (
            <Card key={result.rosterId}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className="w-5 text-sm font-medium text-muted-foreground">
                    {index + 1}
                  </span>
                  <CardTitle className="flex-1">{result.teamName}</CardTitle>
                  <Badge variant="default" className="tabular-nums">
                    {(result.playoffOdds * 100).toFixed(1)}%
                  </Badge>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
