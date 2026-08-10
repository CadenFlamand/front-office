"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";

import { signOut } from "@/lib/auth/actions";

export function SignOutButton({ showLabel = false }: { showLabel?: boolean }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      aria-label="Sign out"
      className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
      disabled={isPending}
      onClick={() => startTransition(() => signOut())}
      title="Sign out"
      type="button"
    >
      <LogOut aria-hidden="true" className="size-4" />
      <span className={showLabel ? undefined : "hidden sm:inline"}>Sign out</span>
    </button>
  );
}
