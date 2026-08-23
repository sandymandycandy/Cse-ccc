"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/auth/guards";
import {
  verifyTotp,
  decryptSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
} from "@/lib/auth/totp";
import { writeAudit } from "@/lib/admin/audit";
import type { SetupTotpState } from "@/lib/admin/form-state";

/**
 * Forced TOTP enrollment (SECURITY_SPEC §3) for an already-authenticated admin
 * whose role requires a second factor but who has none yet. Verifies the code
 * against the freshly-generated secret (encrypted and round-tripped through a
 * hidden field, as in accept-invite), then bumps `session_epoch` so the
 * password-only session dies and the next request forces a full 2FA login.
 */
const Schema = z.object({
  totp: z.string().trim().min(1),
  secret: z.string().min(1),
});

export async function setupTotpAction(
  _prev: SetupTotpState,
  formData: FormData,
): Promise<SetupTotpState> {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." };

  const parsed = Schema.safeParse({
    totp: formData.get("totp"),
    secret: formData.get("secret"),
  });
  if (!parsed.success) return { error: "Enter the 6-digit code from your authenticator." };

  const admin = createAdminClient();

  // Never clobber an existing second factor.
  const { data: existing } = await admin
    .from("admin_totp")
    .select("confirmed_at")
    .eq("admin_id", session.id)
    .maybeSingle();
  if (existing?.confirmed_at) redirect("/admin");

  let secret: string;
  try {
    secret = decryptSecret(parsed.data.secret);
  } catch {
    return { error: "Enrollment expired — reload the page and scan again." };
  }
  if (!verifyTotp(secret, parsed.data.totp)) {
    return { error: "That authenticator code didn't match. Use the current one." };
  }

  const recovery = generateRecoveryCodes();
  const { error: totpErr } = await admin.from("admin_totp").upsert({
    admin_id: session.id,
    secret_encrypted: parsed.data.secret, // authenticated ciphertext of the secret
    confirmed_at: new Date().toISOString(),
    recovery_codes_hashed: recovery.map(hashRecoveryCode),
  });
  if (totpErr) return { error: "Couldn't save your two-factor setup. Try again." };

  // Invalidate the password-only session so the next request forces a fresh login
  // with the new second factor (getAdminSession rejects a stale session_epoch).
  const { data: cur } = await admin
    .from("admin_users")
    .select("session_epoch")
    .eq("id", session.id)
    .maybeSingle();
  await admin
    .from("admin_users")
    .update({ session_epoch: (cur?.session_epoch ?? 0) + 1 })
    .eq("id", session.id);

  await writeAudit({
    actorId: session.id,
    action: "totp_enrolled",
    entity: "admin_user",
    entityId: session.id,
    after: { mandatory: true },
  });

  return { recoveryCodes: recovery };
}
