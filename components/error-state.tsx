"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

// Shared fallback for every route-segment error.tsx — a genuine API/network
// failure (Sleeper or FantasyCalc down, slow, or timed out), distinct from
// the "that league/link doesn't exist" states which already have their own
// not-found.tsx / InvalidTradeLink UI.
export function ErrorState({
  onRetry,
  homeHref = "/start",
  homeLabel = "Try a different league",
}: {
  onRetry: () => void;
  homeHref?: string;
  homeLabel?: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-16 text-center dark:bg-black">
      <div className="flex flex-col items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="max-w-md text-zinc-600 dark:text-zinc-400">
          Sleeper or FantasyCalc might be slow or temporarily unavailable. Give it a
          moment and try again.
        </p>
        <div className="mt-2 flex items-center gap-4">
          <Button onClick={onRetry}>Try again</Button>
          <Link
            href={homeHref}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {homeLabel} →
          </Link>
        </div>
      </div>
    </div>
  );
}
