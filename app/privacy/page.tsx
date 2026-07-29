import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";

export default function PrivacyPage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="flex items-center justify-between border-b bg-background px-6 py-4 sm:px-8">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          Front Office
        </Link>
        <ThemeToggle />
      </header>

      <section className="mx-auto w-full max-w-2xl px-6 py-16 sm:px-8 sm:py-20">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
          Privacy
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">
          Front Office is a small pre-launch beta. Here&apos;s what that means for your data.
        </p>

        <div className="mt-10 flex flex-col gap-8 text-zinc-600 dark:text-zinc-400">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-white">
              What we collect
            </h2>
            <p className="mt-2">
              If you join the beta waitlist, we collect the email address you give us — and,
              only if you choose to share it, a Sleeper league ID. That&apos;s it. We don&apos;t
              ask for a password, payment info, or anything else to get on the list.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-white">
              Why we collect it
            </h2>
            <p className="mt-2">
              Solely to email you when beta access opens up and to share occasional app
              updates. We don&apos;t sell your email, share it with anyone else, or use it for
              anything beyond that.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-white">
              Sleeper and FantasyCalc data
            </h2>
            <p className="mt-2">
              The rest of the app — rosters, matchups, playoff odds, trade values — is pulled
              live from Sleeper&apos;s and FantasyCalc&apos;s public APIs using the league ID
              you enter. That&apos;s league data those services already make publicly
              available, not personal information we&apos;re collecting about you.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-white">
              Questions or want to be removed?
            </h2>
            <p className="mt-2">
              Email{" "}
              <a
                href="mailto:frontoffice031@gmail.com"
                className="font-medium text-zinc-950 underline underline-offset-2 dark:text-white"
              >
                frontoffice031@gmail.com
              </a>{" "}
              and we&apos;ll take care of it.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
