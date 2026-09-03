"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateReset, consumeReset } from "@/lib/admin/resets";
import { hashPassword, validatePassword } from "@/lib/auth/password";
import {
  verifyTotp,
  decryptSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
} from "@/lib/auth/totp";
import { enqueueEmail } from "@/lib/email";
import type { ResetPasswordState } from "@/lib/admin/form-state";

const Schema = z.object({
  token: z.string().min(1),
  password: z.string().min(1).max(200),
  totp: z.string().trim().min(1),
  secret: z.string().min(1),
});

/**
 * Complete a password reset (design D1: this also re-enrols TOTP).
 *
 * ⚠️ ORDER MATTERS. The token is consumed BEFORE anything is written — unlike
 * `accept-invite`, which consumes last. Consume-first means a double-submitted
 * link cannot apply twice, and it picks the safe failure direction: a crash
 * after the consume leaves a burned token and an UNCHANGED password, so the
 * admin simply asks for another link.
 *
 * ⚠️ This must never write `role`, `club_id`, or `is_active`. A reset recovers
 * an account; it does not re-grant it.
 */
export async function resetPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const parsed = Schema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    totp: formData.get("totp"),
    secret: formData.get("secret"),
  });
  if (!parsed.success) return { error: "Fill in every field." };
  const { token, password, totp, secret: encSecret } = parsed.data;

  // Never trust the page's copy of the token.
  const reset = await validateReset(token);
  if (!reset) {
    return { error: "This link is invalid or has expired. Ask for a new one." };
  }

  // Confirm the new authenticator works BEFORE the password changes, so a
  // failed enrolment can't leave them locked out of an account they just reset.
  let secret: string;
  try {
    secret = decryptSecret(encSecret);
  } catch {
    return { error: "Enrollment expired — reload the page and scan again." };
  }
  if (!verifyTotp(secret, totp)) {
    return { error: "That authenticator code didn't match. Use the current one." };
  }

  const policy = await validatePassword(password);
  if (!policy.ok) return { error: policy.reason };

  const admin = createAdminClient();
  const { data: user } = await admin
    .from("admin_users")
    .select("id, email, full_name, session_epoch")
    .eq("email", reset.email)
    .maybeSingle();
  if (!user) return { error: "This account no longer exists." };

  // Single-use gate. Everything below happens at most once per link.
  if (!(await consumeReset(reset.id))) {
    return { error: "This link has already been used. Ask for a new one." };
  }

  const passwordHash = await hashPassword(password);
  const recovery = generateRecoveryCodes();

  // password_hash + session_epoch ONLY. Bumping the epoch kills every live
  // session for this admin (guards.ts rejects a stale epoch), which is what
  // makes a reset evict an attacker who is already signed in.
  const { error: userErr } = await admin
    .from("admin_users")
    .update({ password_hash: passwordHash, session_epoch: (user.session_epoch ?? 0) + 1 })
    .eq("id", user.id);
  if (userErr) return { error: "Couldn't update your password. Ask for a new link." };

  // Replaces the secret AND all 10 old recovery codes — the previous set stops
  // working the moment this lands.
  const { error: totpErr } = await admin.from("admin_totp").upsert({
    admin_id: user.id,
    secret_encrypted: encSecret,
    confirmed_at: new Date().toISOString(),
    recovery_codes_hashed: recovery.map(hashRecoveryCode),
  });
  if (totpErr) return { error: "Couldn't save your two-factor setup. Ask for a new link." };

  // ⚠️ NOT optional. Per design D1 the emailed link alone is enough to take
  // this account over, so this notice is the only way an admin ever finds out
  // that someone else reset it. Never gate this behind a preference.
  await enqueueEmail({
    template: "admin_password_reset_done",
    toEmail: user.email,
    toName: user.full_name,
    subject: "Your CSE Council admin password was reset",
    priority: 1,
    payload: {
      body:
        "Your admin password and authenticator were just reset, and every signed-in session was ended. " +
        "If this wasn't you, tell the Tech Head immediately — whoever did it can now sign in as you.",
    },
  });

  return { recoveryCodes: recovery };
}
