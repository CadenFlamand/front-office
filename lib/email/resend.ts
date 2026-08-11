import { Resend } from "resend";

// Fails loudly at import time rather than on first send — same "empty key
// would make every session forgeable" reasoning as lib/auth/session.ts's
// getKey(), just for outbound mail instead of session signing. No
// `server-only` import, matching every lib/db/*.ts module: this needs to
// stay importable from tsx scripts outside the Next request graph, and the
// throw-on-missing-env-var already fails hard if this were ever pulled into
// a client bundle.
if (!process.env.RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY is not set");
}
const resend = new Resend(process.env.RESEND_API_KEY);

// mail.frontofficefantasy.site is the verified Resend sending domain — any
// local part works once the domain itself is verified, no per-address setup
// needed.
const FROM_ADDRESS = "Front Office <no-reply@mail.frontofficefantasy.site>";

function passwordResetHtml(resetUrl: string): string {
  // Deliberately plain: inline styles only (no external stylesheet, no
  // client-side JS — email clients strip both), no attempt at the app's
  // dark "data-terminal" surface system, which assumes a browser rendering
  // CSS custom properties. One transactional email doesn't earn a design
  // system of its own.
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #18181b;">
      <p style="font-size: 15px; font-weight: 600; letter-spacing: -0.01em; margin: 0 0 24px;">Front Office</p>
      <h1 style="font-size: 20px; font-weight: 600; margin: 0 0 12px;">Reset your password</h1>
      <p style="font-size: 14px; line-height: 1.6; color: #52525b; margin: 0 0 24px;">
        Click the button below to choose a new password. This link expires in 1 hour and can only be used once.
      </p>
      <a href="${resetUrl}" style="display: inline-block; background: #18181b; color: #fafafa; font-size: 14px; font-weight: 500; text-decoration: none; padding: 12px 20px; border-radius: 8px;">
        Reset password
      </a>
      <p style="font-size: 13px; line-height: 1.6; color: #71717a; margin: 24px 0 0;">
        If you didn't request this, you can safely ignore this email — your password won't change.
      </p>
    </div>
  `.trim();
}

/**
 * Sends the reset email. Throws on failure — the caller (lib/auth/actions.ts's
 * requestPasswordReset) decides how to surface that; this module has no
 * opinion on anti-enumeration behavior, only on how to send mail.
 */
export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: email,
    subject: "Reset your Front Office password",
    html: passwordResetHtml(resetUrl),
  });
  if (error) {
    throw new Error(`Resend failed to send: ${error.message}`);
  }
}
