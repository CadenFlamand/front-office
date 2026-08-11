import Link from "next/link";
import { ArrowRight, GitCompareArrows, Share2, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BetaSignupForm } from "@/components/beta-signup-form";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="flex items-center justify-between border-b bg-background px-6 py-4 sm:px-8">
        <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <img src="/mark.png" alt="" className="size-6" />
          Front <span className="text-brand-gold">Office</span>
        </span>
        <ThemeToggle />
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 pt-20 pb-24 sm:px-8 sm:pt-28 sm:pb-32">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-1/2 -z-10 h-[420px] w-[760px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-emerald-500/10 blur-3xl dark:bg-emerald-500/15"
        />

        <div className="mx-auto grid w-full max-w-6xl gap-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="flex flex-col gap-6">
            <Badge variant="outline" className="w-fit">
              Redraft trade analyzer
            </Badge>

            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-[3.4rem]">
              <span className="block text-brand-gold">
                Your ticket to the playoffs
              </span>
              <span className="mt-2 block text-zinc-950 dark:text-white">
                Front Office tells you what the trade does to your season.
              </span>
            </h1>

            <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
              Every trade runs through a live playoff-odds simulation for your
              actual league before you hit send — not a dynasty rankings sheet.
            </p>

            <div>
              <Button size="lg" className="gap-1.5 px-5" nativeButton={false} render={<Link href="/start" />}>
                Get Started
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>

          <div className="mx-auto w-full max-w-sm lg:ml-auto lg:mr-0">
            <Card className="shadow-xl shadow-zinc-950/5 dark:shadow-none">
              <CardContent className="flex flex-col gap-4">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Playoff odds after this trade
                </p>
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-semibold text-muted-foreground tabular-nums line-through decoration-1">
                    61.2%
                  </span>
                  <ArrowRight className="size-5 text-muted-foreground" />
                  <span className="text-3xl font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">
                    78.4%
                  </span>
                </div>
                <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  +17.2 pts from this trade
                </p>

                <div className="mt-2 flex flex-col gap-2 border-t pt-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">You give</span>
                    <span className="font-medium">Aaron Jones</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">You receive</span>
                    <span className="font-medium">Breece Hall</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* "No one wants to be last" — deliberately dark/gold regardless of theme,
          the first beat after the hero: stakes/humor before we explain why
          the product works. Clips are muted/looped/autoplaying (see
          punishment-1/2.mov -> .mp4/.webm conversion in public/videos/),
          shown large and in full color as real content, not background
          texture. */}
      <section className="relative overflow-hidden border-t border-zinc-800 bg-black px-6 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-10 lg:flex-row lg:justify-center">
          <video
            aria-hidden="true"
            autoPlay
            muted
            loop
            playsInline
            poster="/videos/punishment-1-poster.jpg"
            className="aspect-[9/16] w-64 -rotate-6 rounded-2xl object-cover shadow-2xl shadow-black/50 ring-1 ring-white/10 sm:w-72 lg:w-80"
          >
            <source src="/videos/punishment-1.webm" type="video/webm" />
            <source src="/videos/punishment-1.mp4" type="video/mp4" />
          </video>

          <div className="flex flex-col items-center gap-4 text-center">
            <h2 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              No one wants to be last
            </h2>
            <Button
              size="lg"
              className="gap-1.5 bg-white px-5 text-black hover:bg-zinc-200"
              nativeButton={false}
              render={<Link href="/start" />}
            >
              Try Front Office now
              <ArrowRight className="size-4" />
            </Button>
          </div>

          <video
            aria-hidden="true"
            autoPlay
            muted
            loop
            playsInline
            poster="/videos/punishment-2-poster.jpg"
            className="aspect-[9/16] w-64 rotate-6 rounded-2xl object-cover shadow-2xl shadow-black/50 ring-1 ring-white/10 sm:w-72 lg:w-80"
          >
            <source src="/videos/punishment-2.webm" type="video/webm" />
            <source src="/videos/punishment-2.mp4" type="video/mp4" />
          </video>
        </div>
      </section>

      {/* Features */}
      <section className="border-t px-6 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
          <div className="max-w-xl">
            <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
              Why Front Office
            </h2>
            <p className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Built around what actually happens the rest of your season.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card className="md:col-span-2">
              <CardContent className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                    <GitCompareArrows className="size-4" />
                    <span className="text-xs font-medium tracking-wide uppercase">
                      The part nobody else does
                    </span>
                  </div>
                  <h3 className="text-xl font-semibold tracking-tight">
                    Every trade shows the before and after
                  </h3>
                  <p className="max-w-md text-zinc-600 dark:text-zinc-400">
                    Not a value grade — your actual playoff-odds swing,
                    simulated for your real league. Rankings-based tools can&apos;t
                    show you this; they aren&apos;t running your season at all.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3 font-mono text-sm tabular-nums">
                  <span className="text-muted-foreground">83.1%</span>
                  <ArrowRight className="size-4 text-muted-foreground" />
                  <span className="font-semibold text-red-600 dark:text-red-400">
                    14.4%
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex flex-col gap-2">
                <TrendingUp className="size-5 text-muted-foreground" />
                <h3 className="font-semibold tracking-tight">
                  Playoff odds, simulated live
                </h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  10,000 Monte Carlo simulations blend season-long projections
                  with your actual results, updating every week of the season.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex flex-col gap-2">
                <Share2 className="size-5 text-muted-foreground" />
                <h3 className="font-semibold tracking-tight">
                  Built for the group chat
                </h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Turn any trade into a shareable verdict card — value, odds
                  swing, and verdict, ready to drop in your league&apos;s chat.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="border-t px-6 py-20 text-center sm:px-8 sm:py-28">
        <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-6">
          <p className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            See what your next trade actually does.
          </p>
          <Button size="lg" className="gap-1.5 px-5" nativeButton={false} render={<Link href="/start" />}>
            Get Started
            <ArrowRight className="size-4" />
          </Button>

          <BetaSignupForm />
        </div>
      </section>
    </div>
  );
}
