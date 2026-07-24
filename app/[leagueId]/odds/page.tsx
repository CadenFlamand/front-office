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
  const results = await getPlayoffOdds(leagueId);

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="flex w-full max-w-lg flex-col gap-4">
        <h1 className="text-xl font-semibold">Playoff Odds (10,000 simulations)</h1>
        <ol className="flex flex-col gap-1">
          {results.map((result, i) => (
            <li key={result.rosterId}>
              {i + 1}. {result.teamName} — {result.record} —{" "}
              {(result.playoffOdds * 100).toFixed(1)}%
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
