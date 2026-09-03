"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth/guards";
import { canManage, ADMIN_ROLES } from "@/lib/auth/capabilities";
import { createInvite } from "@/lib/admin/invites";
import { siteOrigin } from "@/lib/site-origin";
import { enqueueEmail } from "@/lib/email";
import type { InviteCreateState } from "@/lib/admin/form-state";

const Schema = z.object({
  email: z.string().trim().toLowerCase().email().max(120),
  role: z.enum(ADMIN_ROLES),
  clubId: z.string().uuid().optional().or(z.literal("")),
});

/** Generate an onboarding invite. Tech Head only (manage:admins is Tech-only). */
export async function generateInviteAction(
  _prev: InviteCreateState,
  formData: FormData,
): Promise<InviteCreateState> {
  const session = await getAdminSession();
  if (!session || !canManage(session, "manage:admins")) {
    return { error: "Not permitted." };
  }

  const parsed = Schema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
    clubId: formData.get("clubId") || "",
  });
  if (!parsed.success) return { error: "Enter a valid email and pick a role." };
  const { email, role, clubId } = parsed.data;

  // ⚠️ Resolve the origin BEFORE minting the invite — from configuration only,
  // never the request's Host header. An invite token sets a password and enrols
  // TOTP, so a spoofed Host would mail a new admin's credentials-setup link to
  // an attacker. Checked first so a missing env can't leave an orphan invite row.
  const origin = siteOrigin();
  if (!origin) {
    return { error: "Site URL is not configured — can't issue an invite link." };
  }

  const { token } = await createInvite({
    email,
    role,
    clubId: clubId || null,
    createdBy: session.id,
  });

  revalidatePath("/admin/users");
  const inviteUrl = `${origin}/admin/accept-invite?token=${token}`;
  // Email the invite to the new admin (§11); the URL is still returned so the Tech
  // Head can copy it as a fallback. Best-effort — a send hiccup never loses the link.
  try {
    await enqueueEmail({
      template: "admin_invite",
      toEmail: email,
      subject: "Your CSE Council admin invite",
      payload: { inviteUrl, role },
      priority: 1,
    });
  } catch {
    /* swallow — the URL is still returned + shown on screen */
  }
  return { inviteUrl };
}
