"use client";

import { Switch } from "@/components/ui/switch";
import { useValueVisibility } from "@/lib/value-visibility";

// The page-level control; every individual value/placeholder on the page
// (see ValueAmount) reads and writes the exact same stored scope, so this
// switch and any inline "Show value" placeholder stay in sync automatically
// — there's no separate "master" state to wire up.
export function ShowValuesToggle({ scope }: { scope: string }) {
  const [show, setShow] = useValueVisibility(scope);

  return (
    <label className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
      Show values
      <Switch checked={show} onCheckedChange={setShow} />
    </label>
  );
}
