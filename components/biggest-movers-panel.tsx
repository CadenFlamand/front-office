import { TrendingDown, TrendingUp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { OddsMover } from "@/lib/db/snapshot";

export interface MoverRow extends OddsMover {
  teamName: string;
}

/**
 * The odds page's "Biggest Movers" side panel — presentational only, no
 * client state. Ranked by absolute swing regardless of direction (see
 * lib/db/snapshot.ts's getWeekOverWeekOddsMovers), so this naturally shows
 * both up and down movers when both exist rather than needing two separate
 * lists.
 */
export function BiggestMoversPanel({ movers }: { movers: MoverRow[] }) {
  return (
    <Card className="bg-surface-1">
      <CardContent className="flex flex-col gap-3">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Biggest Movers This Week
        </p>

        {movers.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            Movers will show up once there&apos;s more than one week of snapshot history.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {movers.map((mover) => (
              <MoverListItem key={mover.rosterId} mover={mover} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function MoverListItem({ mover }: { mover: MoverRow }) {
  const deltaPts = mover.delta * 100;
  const up = deltaPts > 0;
  // Icon + color + explicit sign together — status meaning is never carried
  // by color alone.
  const Icon = up ? TrendingUp : TrendingDown;
  const toneClass = up
    ? "text-emerald-600 dark:text-emerald-400"
    : deltaPts < 0
      ? "text-red-600 dark:text-red-400"
      : "text-muted-foreground";

  return (
    <li className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2">
      <Icon aria-hidden="true" className={`size-4 shrink-0 ${toneClass}`} />
      <span className="min-w-0 flex-1 truncate text-sm text-copy-bright">{mover.teamName}</span>
      <span className={`shrink-0 text-sm font-medium tabular-nums ${toneClass}`}>
        {deltaPts >= 0 ? "+" : ""}
        {deltaPts.toFixed(1)}%
      </span>
    </li>
  );
}
