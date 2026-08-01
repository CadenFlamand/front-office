"use server";

import { neon } from "@neondatabase/serverless";

import { isValidEmail } from "@/lib/validate-email";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}
const sql = neon(process.env.DATABASE_URL);

const MAX_FEEDBACK_LENGTH = 4000;

export interface BetaFeedbackResult {
  ok: boolean;
  error?: string;
}

export async function submitBetaFeedback(
  email: string,
  feedback: string
): Promise<BetaFeedbackResult> {
  const trimmedEmail = email.trim();
  const trimmedFeedback = feedback.trim();

  if (!isValidEmail(trimmedEmail)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (trimmedFeedback.length === 0) {
    return { ok: false, error: "Add some feedback before sending." };
  }
  if (trimmedFeedback.length > MAX_FEEDBACK_LENGTH) {
    return { ok: false, error: `Keep feedback under ${MAX_FEEDBACK_LENGTH} characters.` };
  }

  try {
    await sql`INSERT INTO beta_feedback (email, feedback) VALUES (${trimmedEmail}, ${trimmedFeedback})`;
    return { ok: true };
  } catch {
    return { ok: false, error: "Something went wrong — try again in a moment." };
  }
}
