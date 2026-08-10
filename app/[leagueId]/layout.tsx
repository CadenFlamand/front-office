import type { ReactNode } from "react";
import Link from "next/link";
import { UserRound } from "lucide-react";

import { ScrollableNav } from "@/components/scrollable-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { TradeTabNudge } from "@/components/trade-tab-nudge";
import { getCurrentUser } from "@/lib/auth/dal";

const NAV_LINKS = [
  { label: "Team", segment: "" },
  { label: "League", segment: "/league" },
  { label: "Players", segment: "/players" },
  { label: "Trade", segment: "/trade" },
  { label: "Odds", segment: "/odds" },
  { label: "Waivers", segment: "/waivers" },
];

export default async function LeagueLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  // Sleeper league pages are viewable signed-out, so this is presentational
  // only — it decides whether to offer a sign-out affordance, never whether
  // the page renders.
  const user = await getCurrentUser();

  return (
    <div className="flex flex-1 flex-col">
      <nav className="flex items-center gap-1 border-b bg-background px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="mr-2 flex shrink-0 items-center gap-2 text-sm font-semibold tracking-tight whitespace-nowrap transition-colors hover:text-primary"
        >
          <img src="/mark.png" alt="" className="size-6" />
          Front <span className="text-brand-gold">Office</span>
        </Link>
        {/* Scrolls horizontally on narrow viewports instead of wrapping or
            pushing the wordmark/toggle off-screen — there isn't room for
            the wordmark + 5 links + toggle on one line at phone widths. */}
        <ScrollableNav
          links={NAV_LINKS.map((link) => ({
            label: link.label,
            href: `/${leagueId}${link.segment}`,
          }))}
        />
        <div className="ml-2 flex shrink-0 items-center gap-3">
          {user && (
            <>
              <Link
                aria-label="Account"
                className="text-muted-foreground transition-colors hover:text-foreground"
                href="/account"
                title="Account"
              >
                <UserRound aria-hidden="true" className="size-4" />
              </Link>
              <SignOutButton />
            </>
          )}
          <ThemeToggle />
        </div>
      </nav>
      <TradeTabNudge leagueId={leagueId} />
      {children}
    </div>
  );
}
