"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/dal";
import { validateNewPassword } from "@/lib/auth/password";
import { createResetToken, redeemResetToken } from "@/lib/db/password-reset";
import {
  createUser,
  getUserByEmail,
  updatePassword,
  verifyCredentials,
  verifyCurrentPassword,
} from "@/lib/db/users";
import { sendPasswordResetEmail } from "@/lib/email/resend";

import { createSession, destroySession } from "./session";

export interface AuthFormResult {
  error: string;
}

export type ChangePasswordResult = { ok: true } | { ok: false; error: string };
export type RequestPasswordResetResult = { ok: true };
export type ResetPasswordResult = { ok: true } | { ok: false; error: string };

// Intentionally permissive: the only claim worth making about an address
// without sending mail to it is that it's shaped like one.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(email: string, password: string): string | null {
  if (!email.trim()) return "Enter your email.";
  if (!EMAIL_PATTERN.test(email.trim())) return "Enter a valid email address.";
  return validateNewPassword(password);
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

/**
 * Requires the current password rather than trusting the session alone —
 * the session cookie can outlive a shoulder-surfed or left-open browser tab
 * for up to 30 days, so a password change (the recovery path if someone else
 * gets access) shouldn't be doable with just that cookie.
 *
 * Hashes the new password the same way sign-up does (updatePassword ->
 * hashPassword, bcrypt) — there is only one hashing path in the app.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<ChangePasswordResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You need to be signed in." };

  if (!currentPassword) return { ok: false, error: "Enter your current password." };
  const invalid = validateNewPassword(newPassword);
  if (invalid) return { ok: false, error: invalid };
  if (newPassword === currentPassword) {
    return { ok: false, error: "New password must be different from your current password." };
  }

  const valid = await verifyCurrentPassword(user.id, currentPassword);
  if (!valid) return { ok: false, error: "Current password is incorrect." };

  await updatePassword(user.id, newPassword);
  return { ok: true };
}

// Response is identical whether or not the email is registered — the return
// type has no `error` variant at all, so there's no way for a caller to
// accidentally branch on "which one happened" the way there would be with a
// { ok: false } case. Same anti-enumeration principle as signIn()'s merged
// error message, just enforced by the type this time instead of by a shared
// string.
//
// Timing is the other half of that leak: sending a real email costs a real
// network round trip that a plain "no such user" return wouldn't. The
// artificial delay below closes that gap for the not-found path — same
// instinct as lib/db/users.ts's DUMMY_HASH, which does the equivalent for
// sign-in's bcrypt cost.
const ENUMERATION_DELAY_MS = 400;

export async function requestPasswordReset(email: string): Promise<RequestPasswordResetResult> {
  const user = await getUserByEmail(email);

  if (!user) {
    await new Promise((resolve) => setTimeout(resolve, ENUMERATION_DELAY_MS));
    return { ok: true };
  }

  const token = await createResetToken(user.id);
  const headerList = await headers();
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  const host = headerList.get("host");
  const resetUrl = `${proto}://${host}/reset-password?token=${token}`;

  await sendPasswordResetEmail(user.email, resetUrl);
  return { ok: true };
}

/**
 * Redeems a reset token and sets the new password. Unlike changePassword,
 * there's no current password to check against — a valid token *is* the
 * proof of identity here, standing in for it. Signs the caller in and
 * redirects on success, matching signUp()'s "successful auth action lands
 * you in the app" convention, since receiving the reset link already proved
 * they own the account.
 *
 * Does not revoke any other active session on this account — same accepted
 * limitation changePassword() already has (sessions are stateless JWTs with
 * no server-side revocation list).
 */
export async function resetPassword(
  token: string,
  newPassword: string
): Promise<ResetPasswordResult> {
  const invalid = validateNewPassword(newPassword);
  if (invalid) return { ok: false, error: invalid };

  const userId = await redeemResetToken(token);
  if (!userId) {
    return { ok: false, error: "This reset link is invalid or has expired." };
  }

  await updatePassword(userId, newPassword);
  await createSession(userId);
  redirect("/start");
}
