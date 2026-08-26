"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { writeAudit } from "@/lib/admin/audit";
import { getContactMessage } from "@/lib/admin/contact";

/** Toggle a contact message's handled state. Plain form action (no client
 *  state): the detail page posts the id + the target state via hidden inputs. */
export async function setContactHandledAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  // Council-wide capability — no club scope, so an `all` grant suffices.
  if (!canManage(session, "manage:contact")) redirect("/admin/contact");

  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) redirect("/admin/contact");

  const existing = await getContactMessage(id);
  if (!existing) redirect("/admin/contact");

  const handled = String(formData.get("handled") ?? "") === "true";
  const handledAt = handled ? new Date().toISOString() : null;

  const admin = createAdminClient();
  const { error } = await admin.from("contact_messages").update({ handled_at: handledAt }).eq("id", id);
  if (!error) {
    await writeAudit({
      actorId: session.id,
      action: handled ? "mark_handled" : "mark_unhandled",
      entity: "contact_message",
      entityId: id,
      before: { handledAt: existing.handledAt },
      after: { handledAt },
    });
  }

  redirect(`/admin/contact/${id}`);
}
