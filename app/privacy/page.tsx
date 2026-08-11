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
          Front Office is a small, pre-launch beta. Here&apos;s what that means for your data.
        </p>

        <div className="mt-10 flex flex-col gap-8 text-zinc-600 dark:text-zinc-400">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-white">
              Accounts
            </h2>
            <p className="mt-2">
              If you create an account, we collect the email address and password you provide.
              Your password is never stored in plain text — it&apos;s hashed before it touches
              our database, and we can&apos;t see or recover it. If you forget it, we send a
              one-time reset link to your email that expires after a short window.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-white">
              League data
            </h2>
            <p className="mt-2">
              The rest of the app — rosters, matchups, standings, playoff odds, and trade
              values — is pulled live using the league ID you provide, from Sleeper&apos;s and
              ESPN&apos;s public APIs (for synced leagues) or entered directly by you (for
              manually-created leagues). Synced league data is publicly available through
              those platforms already; it&apos;s not personal information we&apos;re
              collecting about you. Manually-entered league data is visible only to your
              account.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-white">
              Player rankings
            </h2>
            <p className="mt-2">
              Trade values and rankings shown in the app are blended from FantasyCalc and
              FantasyPros — public player-valuation data, not anything tied to you personally.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-white">
              Beta feedback and waitlist
            </h2>
            <p className="mt-2">
              If you join the beta waitlist or submit feedback through the app, we collect the
              email address you give us (and, for feedback, whatever you write). We use this
              solely to communicate with you about the beta and to improve the product — never
              sold, never shared with third parties beyond what&apos;s needed to run the app
              (e.g. our hosting and database providers).
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-white">
              Cookies and sessions
            </h2>
            <p className="mt-2">
              If you&apos;re signed in, we use a secure session cookie to keep you logged in.
              It doesn&apos;t track you across other sites and isn&apos;t used for advertising.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-white">
              Questions, or want your data removed?
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
