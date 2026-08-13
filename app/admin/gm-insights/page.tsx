import { GmInsightAdmin } from "@/components/gm-insight-admin";
import { requireAdminAccess } from "@/lib/auth/dal";
import { listGmInsightsForAdmin } from "@/lib/gm-insights-action";

export const metadata = {
  title: "GM Insights | Front Office",
};

export default async function GmInsightsAdminPage() {
  await requireAdminAccess();
  const insights = await listGmInsightsForAdmin();

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="flex w-full max-w-2xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">GM Insights</h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Hand-curated notes shown on the dashboard&apos;s GM Insight panel — distinct from the
            app&apos;s computed advice signals.
          </p>
        </div>

        <GmInsightAdmin insights={insights} />
      </div>
    </div>
  );
}
