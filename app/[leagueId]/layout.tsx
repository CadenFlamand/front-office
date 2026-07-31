import type { ReactNode } from "react";
import Link from "next/link";

import { ScrollableNav } from "@/components/scrollable-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { TradeTabNudge } from "@/components/trade-tab-nudge";

const NAV_LINKS = [
  { label: "Team", segment: "" },
  { label: "League", segment: "/league" },
  { label: "Players", segment: "/players" },
  { label: "Trade", segment: "/trade" },
  { label: "Odds", segment: "/odds" },
];

export default async function LeagueLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;

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
        <div className="ml-2 flex shrink-0 items-center">
          <ThemeToggle />
        </div>
      </nav>
      <TradeTabNudge leagueId={leagueId} />
      {children}
    </div>
  );
}
