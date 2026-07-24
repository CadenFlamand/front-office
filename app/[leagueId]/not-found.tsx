import Link from "next/link";

export default function LeagueNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-16 text-center dark:bg-black">
      <div className="flex flex-col items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          Couldn&apos;t find that league
        </h1>
        <p className="max-w-md text-zinc-600 dark:text-zinc-400">
          Couldn&apos;t find a Sleeper league with that ID.
        </p>
        <Link
          href="/"
          className="mt-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Try a different league →
        </Link>
      </div>
    </div>
  );
}
