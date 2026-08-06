"use server";

import { redirect } from "next/navigation";

import { createUser, verifyCredentials } from "@/lib/db/users";

import { createSession, destroySession } from "./session";

export interface AuthFormResult {
  error: string;
}

// Low enough not to annoy, high enough to rule out trivially guessable
// passwords. Deliberately no composition rules (symbols/digits/case), which
// research consistently finds push users toward predictable patterns.
const MIN_PASSWORD_LENGTH = 8;

// Intentionally permissive: the only claim worth making about an address
// without sending mail to it is that it's shaped like one.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(email: string, password: string): string | null {
  if (!email.trim()) return "Enter your email.";
  if (!EMAIL_PATTERN.test(email.trim())) return "Enter a valid email address.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

export async function signUp(email: string, password: string): Promise<AuthFormResult> {
  const invalid = validate(email, password);
  if (invalid) return { error: invalid };

  const result = await createUser(email, password);
  if (!result.ok) {
    return { error: "An account with that email already exists." };
  }

  await createSession(result.user.id);
  redirect("/start");
}

export async function signIn(email: string, password: string): Promise<AuthFormResult> {
  if (!email.trim() || !password) {
    return { error: "Enter your email and password." };
  }

  const user = await verifyCredentials(email, password);
  if (!user) {
    // One message for both "no such account" and "wrong password" — naming
    // which one is wrong tells an attacker which addresses are registered.
    return { error: "Email or password is incorrect." };
  }

  await createSession(user.id);
  redirect("/start");
}

export async function signOut(): Promise<void> {
  await destroySession();
  redirect("/signin");
}
