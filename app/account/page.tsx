import Link from "next/link";

import { ChangePasswordForm } from "@/components/change-password-form";
import { SignOutButton } from "@/components/sign-out-button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { requireUser } from "@/lib/auth/dal";

export const metadata = {
  title: "Account | Front Office",
};

const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  premium: "Premium",
};

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="flex w-full max-w-md flex-col gap-8">
        <div className="flex flex-col gap-2">
          <Link
            className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            href="/start"
          >
            ← Back
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">Account</h1>
        </div>

        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="font-medium">{user.email}</p>
              <p className="text-sm text-muted-foreground">
                {PLAN_LABEL[user.plan] ?? user.plan} plan
              </p>
            </div>
            <SignOutButton showLabel />
          </CardContent>
        </Card>

        <Separator />

        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-medium">Change password</h2>
          <ChangePasswordForm />
        </div>
      </div>
    </div>
  );
}
