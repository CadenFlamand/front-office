import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth-form";
import { getCurrentUser } from "@/lib/auth/dal";

export const metadata = {
  title: "Sign in | Front Office",
};

export default async function SignInPage() {
  if (await getCurrentUser()) redirect("/start");

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Sign in to get to your league.
          </p>
        </div>
        <AuthForm mode="signin" />
      </div>
    </div>
  );
}
