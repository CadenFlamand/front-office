import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10 dark:bg-black sm:px-6 sm:py-16">
      <main className="flex w-full max-w-4xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-muted-foreground">Front Office</p>
          <h1 className="text-3xl font-semibold tracking-tight">Trade Verdict</h1>
          <p className="max-w-2xl text-zinc-600 dark:text-zinc-400">
            A shared trade from the FantasyCalc-powered trade analyzer.
          </p>
        </div>

        <Separator />

        <div className="flex justify-center">
          <Skeleton className="h-10 w-72" />
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between rounded-lg border px-4 py-3">
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>

          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-8">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-7 w-64" />
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-10" />
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
