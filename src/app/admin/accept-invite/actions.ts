"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateInvite, consumeInvite } from "@/lib/admin/invites";
import { hashPassword, validatePassword } from "@/lib/auth/password";
import {
  verifyTotp,
  decryptSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
} from "@/lib/auth/totp";
import type { AcceptInviteState } from "@/lib/admin/form-state";

const Schema = z.object({
  token: z.string().min(1),
  name: z.string().trim().min(2).max(80),
  password: z.string().min(1).max(200),
  totp: z.string().trim().min(1),
  // The TOTP secret we generated on page load, encrypted, round-tripped hidden.
  secret: z.string().min(1),
});

export async function acceptInviteAction(
  _prev: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const parsed = Schema.safeParse({
    token: formData.get("token"),
    name: formData.get("name"),
    password: formData.get("password"),
    totp: formData.get("totp"),
    secret: formData.get("secret"),
  });
  if (!parsed.success) return { error: "Fill in every field." };
  const { token, name, password, totp, secret: encSecret } = parsed.data;

  const invite = await validateInvite(token);
  if (!invite) {
    return { error: "This invite is invalid or has expired. Ask for a new one." };
  }

  // Confirm the authenticator is enrolled before committing anything.
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

  const passwordHash = await hashPassword(password);
  const recovery = generateRecoveryCodes();
  const admin = createAdminClient();

  // Upsert the account by email (the invite fixes role + club).
  const { data: existing } = await admin
    .from("admin_users")
    .select("id")
    .ilike("email", invite.email)
    .maybeSingle();

  const fields = {
    full_name: name,
    role: invite.role,
    club_id: invite.clubId,
    password_hash: passwordHash,
    is_active: true,
  };

  let userId: string;
  if (existing) {
    await admin.from("admin_users").update(fields).eq("id", existing.id);
    userId = existing.id;
  } else {
    const { data, error } = await admin
      .from("admin_users")
      .insert({ email: invite.email, ...fields })
      .select("id")
      .single();
    if (error || !data) return { error: "Couldn't create your account. Try again." };
    userId = data.id;
  }

  const { error: totpErr } = await admin.from("admin_totp").upsert({
    admin_id: userId,
    secret_encrypted: encSecret, // authenticated ciphertext of the enrolled secret
    confirmed_at: new Date().toISOString(),
    recovery_codes_hashed: recovery.map(hashRecoveryCode),
  });
  if (totpErr) return { error: "Couldn't save your two-factor setup. Try again." };

  await consumeInvite(invite.id); // single-use

  return { recoveryCodes: recovery };
}
