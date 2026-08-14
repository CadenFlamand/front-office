"use client";

import { useValueVisibility } from "@/lib/value-visibility";

// Drop-in replacement for `{value.toLocaleString()}` — renders just the
// inner content, so the caller keeps its own wrapping <span>/<Badge> and
// all its existing size/color/font classes untouched. Hidden state renders
// a same-slot "Show value" affordance instead of blanking the space, and
// clicking it flips the same stored scope every other value/placeholder on
// the page reads, revealing all of them at once.
//
// interactive=false renders a plain (non-clickable) placeholder instead —
// required wherever the value already sits inside another clickable
// element (e.g. a whole-row <button> that adds/removes the player): a
// nested <button> there would be invalid HTML and would also trigger the
// row's own onClick, not just this one. Those spots still respond to the
// page-level ShowValuesToggle, just not to clicking the placeholder itself.
export function ValueAmount({
  value,
  scope,
  interactive = true,
}: {
  value: number;
  scope: string;
  interactive?: boolean;
}) {
  const [show, setShow] = useValueVisibility(scope);

  if (show) return <>{value.toLocaleString()}</>;

  if (!interactive) {
    return <span className="text-muted-foreground">Show value</span>;
  }

  return (
    <button
      className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      onClick={() => setShow(true)}
      type="button"
    >
      Show value
    </button>
  );
}
