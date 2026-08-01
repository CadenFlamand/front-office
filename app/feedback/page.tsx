import Link from "next/link";

import { BetaFeedbackForm } from "@/components/beta-feedback-form";
import { ThemeToggle } from "@/components/theme-toggle";

export default function FeedbackPage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="flex items-center justify-between border-b bg-background px-6 py-4 sm:px-8">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          Front Office
        </Link>
        <ThemeToggle />
      </header>

      <section className="mx-auto w-full max-w-md px-6 py-16 sm:px-8 sm:py-20">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
          Beta feedback
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">
          Tell us what&apos;s working, what&apos;s not, or what you&apos;d want to see next —
          we read every submission.
        </p>

        <div className="mt-8">
          <BetaFeedbackForm />
        </div>
      </section>
    </div>
  );
}
