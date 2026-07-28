"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function ScrollableNav({
  links,
}: {
  links: { label: string; href: string }[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Hidden once there's nothing left to scroll to — recomputed on scroll and
  // on resize so it doesn't linger after the user's already found the rest
  // of the tabs, or fail to appear if the window grows past the overflow.
  const [canScrollMore, setCanScrollMore] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function updateScrollState() {
      if (!el) return;
      setCanScrollMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 1);
    }

    updateScrollState();
    el.addEventListener("scroll", updateScrollState);
    window.addEventListener("resize", updateScrollState);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, []);

  return (
    <div className="relative flex min-w-0 flex-1 items-center">
      <div
        ref={scrollRef}
        className="scroll-fade-x flex flex-1 items-center gap-1 overflow-x-auto"
      >
        {links.map((link) => (
          <Link
            key={link.label}
            href={link.href}
            className="shrink-0 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {link.label}
          </Link>
        ))}
      </div>
      {canScrollMore && (
        <ChevronRight
          aria-hidden="true"
          className="pointer-events-none absolute right-0 size-4 shrink-0 text-muted-foreground"
        />
      )}
    </div>
  );
}
