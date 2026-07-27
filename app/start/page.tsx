import { LeagueEntry } from "@/components/league-entry";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="flex w-full max-w-md flex-col gap-8">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Front Office</h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Enter your Sleeper league ID to get started.
          </p>
        </div>

        <LeagueEntry />
      </div>
    </div>
  );
}
