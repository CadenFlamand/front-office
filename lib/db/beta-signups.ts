"use server";

import { neon } from "@neondatabase/serverless";

import { isValidEmail } from "@/lib/validate-email";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}
const sql = neon(process.env.DATABASE_URL);

// Postgres unique_violation — thrown when the email already has a row in
// beta_signups (see the UNIQUE constraint in lib/db/schema.sql).
const UNIQUE_VIOLATION = "23505";

export interface BetaSignupResult {
  ok: boolean;
  alreadySignedUp?: boolean;
  error?: string;
}

export async function submitBetaSignup(email: string): Promise<BetaSignupResult> {
  const trimmed = email.trim();
  if (!isValidEmail(trimmed)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  try {
    await sql`INSERT INTO beta_signups (email) VALUES (${trimmed})`;
    return { ok: true };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === UNIQUE_VIOLATION) {
      return { ok: true, alreadySignedUp: true };
    }
    return { ok: false, error: "Something went wrong — try again in a moment." };
  }
}
