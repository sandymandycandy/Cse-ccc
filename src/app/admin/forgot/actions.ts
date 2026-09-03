"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createReset } from "@/lib/admin/resets";
import { checkPasswordResetLimits } from "@/lib/rate-limit";
import { enqueueEmail } from "@/lib/email";
import type { ForgotState } from "@/lib/admin/form-state";

const Schema = z.object({ email: z.string().trim().toLowerCase().email() });

/**
 * The ONE thing this action ever says. Unknown address, deactivated account,
 * rate-limited, and success all return exactly this — SECURITY_SPEC §3's
 * anti-enumeration rule applied to a new surface. If you are adding a branch
 * that returns different text, you are opening an account-enumeration oracle.
 */
const NEUTRAL =
  "If that address belongs to an admin account, a reset link is on its way. It expires in an hour.";

/**
 * The site origin a reset link may point at, or null if it is not configured.
 *
 * ⚠️ NEVER derive this from the request's Host header. A reset token is, per
 * design D1, sufficient on its own to take over an admin account — pointing the
 * emailed link at an attacker-supplied host would hand it to them (classic
 * password-reset host-header poisoning). `NEXT_PUBLIC_SITE_URL` is a required,
 * URL-validated env var (`src/lib/env.ts:31`); if it is somehow absent we send
 * NOTHING rather than mail a link built from untrusted input.
 */
function resetOrigin(): string | null {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (!configured) return null;
  try {
    return new URL(configured).origin;
  } catch {
    return null;
  }
}

/**
 * Issue a reset link if — and only if — the address is a live admin account.
 * Returns nothing in every case, so no caller can learn which branch ran.
 */
async function issueResetIfEligible(email: string, ip: string): Promise<void> {
  if (!checkPasswordResetLimits({ ip, email }).ok) return;

  const origin = resetOrigin();
  if (!origin) {
    console.error("NEXT_PUBLIC_SITE_URL missing — refusing to mail a reset link");
    return;
  }

  const admin = createAdminClient();
  const { data: user } = await admin
    .from("admin_users")
    .select("id, email, full_name, is_active, password_hash")
    .eq("email", email)
    .maybeSingle();

  // No account, deactivated, or invite never consumed → send nothing.
  if (!user || !user.is_active || !user.password_hash) return;

  const { token } = await createReset(user.email);
  await enqueueEmail({
    template: "admin_password_reset",
    toEmail: user.email,
    toName: user.full_name,
    subject: "Reset your CSE Council admin password",
    priority: 1,
    payload: {
      url: `${origin}/admin/reset/${token}`,
      linkLabel: "Choose a new password",
      body:
        "This link works once and expires in an hour. It will also ask you to set up your authenticator again. " +
        "If you didn't ask for this, ignore this email and tell the Tech Head.",
    },
  });
}

export async function requestResetAction(
  _prev: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const parsed = Schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: "Enter your admin email address." };

  const ip =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  // Never let a failure here change what we say — a thrown DB or mail error
  // would otherwise distinguish "real account" from "no account".
  try {
    await issueResetIfEligible(parsed.data.email, ip);
  } catch (err) {
    console.error("password reset request failed:", err);
  }

  // EXACTLY ONE success return, by construction.
  return { message: NEUTRAL };
}
