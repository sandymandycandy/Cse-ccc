"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth/guards";
import { canManage, ADMIN_ROLES } from "@/lib/auth/capabilities";
import {
  createInvite,
  setAdminActive,
  activeKeyholderIds,
} from "@/lib/admin/invites";
import { canDeactivate } from "@/lib/admin/admin-status";
import { writeAudit } from "@/lib/admin/audit";
import { siteOrigin } from "@/lib/site-origin";
import { enqueueEmail } from "@/lib/email";
import type { InviteCreateState } from "@/lib/admin/form-state";

const Schema = z.object({
  email: z.string().trim().toLowerCase().email().max(120),
  role: z.enum(ADMIN_ROLES),
  clubId: z.string().uuid().optional().or(z.literal("")),
});

/** Generate an onboarding invite. `manage:admins` is held by the faculty
 *  advisor, the vice president and the tech head — not tech head alone. */
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

/**
 * Enable or disable an admin account. Plain form action (no client state): the
 * row posts the id + the target state via hidden inputs, and a refusal comes
 * back as `?denied=` for the page to explain.
 *
 * Access removal is deactivation, not deletion — see `admin-status.ts` for why.
 */
export async function setAdminActiveAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  // Council-wide capability (faculty advisor, VP, tech head) — no club scope.
  if (!canManage(session, "manage:admins")) redirect("/admin");

  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) redirect("/admin/users");
  const active = String(formData.get("active") ?? "") === "true";

  // Only disabling can strand the council; enabling never takes access away.
  if (!active) {
    const check = canDeactivate(session.id, id, await activeKeyholderIds());
    if (!check.ok) redirect(`/admin/users?denied=${check.reason}`);
  }

  const before = await setAdminActive(id, active);
  if (before === null) redirect("/admin/users");

  // The FIRST admin-lifecycle event this system records: creating an admin,
  // changing a role and issuing an admin invite still write nothing at all.
  if (before !== active) {
    await writeAudit({
      actorId: session.id,
      action: active ? "reactivate" : "deactivate",
      entity: "admin_user",
      entityId: id,
      before: { isActive: before },
      after: { isActive: active },
    });
  }

  redirect("/admin/users");
}
