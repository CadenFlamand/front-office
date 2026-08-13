import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10 dark:bg-black sm:px-6 sm:py-16">
      <main className="flex w-full max-w-4xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-muted-foreground">Front Office</p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Player search</h1>
          <p className="max-w-2xl text-zinc-600 dark:text-zinc-400">
            Find any NFL player to add to your next trade scenario.
          </p>
        </div>

        <Separator />

        <div className="flex flex-col gap-5">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-4 w-24" />
          <Card className="gap-0 py-0">
            <CardContent className="flex flex-col divide-y px-0">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
