import { ManualLeagueCreateForm } from "@/components/manual-league-create-form";
import { requireUser } from "@/lib/auth/dal";

export default async function StartManualPage() {
  await requireUser();

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="flex w-full max-w-md flex-col gap-8">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Enter a league manually</h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            No live schedule or scoring data — playoff odds and strength of schedule won&apos;t
            be available, but team names, rosters, records, and the trade analyzer all work.
          </p>
        </div>

        <ManualLeagueCreateForm />
      </div>
    </div>
  );
}
