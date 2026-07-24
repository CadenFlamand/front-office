import type { ReactNode } from "react";
import Link from "next/link";

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
        <span className="mr-2 text-sm font-semibold tracking-tight">Front Office</span>
        {NAV_LINKS.map((link) => (
          <Link
            key={link.label}
            href={`/${leagueId}${link.segment}`}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {link.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
