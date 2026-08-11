import Link from "next/link";
import { redirect } from "next/navigation";

import { ResetPasswordForm } from "@/components/reset-password-form";
import { getCurrentUser } from "@/lib/auth/dal";

export const metadata = {
  title: "Reset password | Front Office",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  if (await getCurrentUser()) redirect("/start");

  const { token } = await searchParams;

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Choose a new password</h1>
          {token && (
            <p className="text-zinc-600 dark:text-zinc-400">
              Enter a new password for your account.
            </p>
          )}
        </div>

        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          // Missing the token entirely (someone navigated here directly
          // rather than via the emailed link) — no point rendering a form
          // that redeemResetToken() will just reject, so this short-circuits
          // before ever calling the action.
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">
              This reset link is missing or invalid.
            </p>
            <Link
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              href="/forgot-password"
            >
              Request a new one
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
