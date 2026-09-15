import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { listRegistrations, getEventFormSchema } from "@/lib/admin/registrations";
import { teamRecipients } from "@/lib/registration-form/recipients";
import { splitRegistrations } from "@/lib/registration/waitlist";
import { dedupeRecipients, type Audience } from "./broadcast-audience";

export interface Recipient {
  email: string;
  name: string | null;
}

/**
 * Turn an audience into addresses. Service role throughout — `anon` has no
 * SELECT on `club_members`, and that lockout is deliberate (see STATUS.md on
 * the Mumbai migration).
 *
 * Authorisation is NOT done here: callers must already have run
 * `isAudienceAllowed` against the event's real club.
 */
export async function resolveRecipients(a: Audience): Promise<Recipient[]> {
  const admin = createAdminClient();

  if (a.kind === "heads") {
    const { data } = await admin
      .from("admin_users")
      .select("email, full_name")
      .in("role", ["club_head", "vice_head"])
      .eq("is_active", true);
    return dedupeRecipients((data ?? []).map((r) => ({ email: r.email, name: r.full_name })));
  }

  if (a.kind === "council") {
    const { data } = await admin
      .from("council_members")
      .select("email, full_name")
      .eq("is_active", true)
      .not("approved_at", "is", null);
    return dedupeRecipients(
      (data ?? []).map((r) => ({ email: r.email ?? "", name: r.full_name })),
    );
  }

  if (a.kind === "club_members" || a.kind === "all_members") {
    const base = admin.from("club_members").select("email, name");
    const { data } = await (a.kind === "club_members"
      ? base.eq("club_id", a.clubId)
      : base);
    return dedupeRecipients((data ?? []).map((r) => ({ email: r.email ?? "", name: r.name })));
  }

  // An event: reuse the per-event path so team members are reached too, not
  // only whoever filled the form in.
  const [regs, { schema }] = await Promise.all([
    listRegistrations(a.eventId),
    getEventFormSchema(a.eventId),
  ]);
  const { confirmed } = splitRegistrations(regs);
  const rows = a.scope === "all" ? regs : confirmed;
  const out: Recipient[] = [];
  for (const r of rows) {
    for (const email of teamRecipients(schema, r.customAnswers, r.email)) {
      // Only the registrant's own address gets their name; a teammate's address
      // belongs to someone else, and greeting them by the leader's name is worse
      // than not greeting them at all.
      out.push({ email, name: email === r.email.trim().toLowerCase() ? r.name : null });
    }
  }
  return dedupeRecipients(out);
}

/** Counts for the picker, so a sender sees the size before choosing. */
export async function audienceCounts(ownClubId: string | null): Promise<{
  heads: number;
  council: number;
  councilTotal: number;
  allMembers: number;
  ownClubMembers: number;
}> {
  const admin = createAdminClient();
  const [heads, councilTotal, members, ownMembers, councilWithEmail] = await Promise.all([
    admin
      .from("admin_users")
      .select("id", { count: "exact", head: true })
      .in("role", ["club_head", "vice_head"])
      .eq("is_active", true),
    admin
      .from("council_members")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .not("approved_at", "is", null),
    admin.from("club_members").select("id", { count: "exact", head: true }),
    ownClubId
      ? admin
          .from("club_members")
          .select("id", { count: "exact", head: true })
          .eq("club_id", ownClubId)
      : Promise.resolve({ count: 0 }),
    // Council is the one list with gaps — 26 of 32 had an address at design
    // time — so the page shows both numbers rather than quietly mailing fewer
    // people than the roster suggests.
    resolveRecipients({ kind: "council" }),
  ]);

  return {
    heads: heads.count ?? 0,
    council: councilWithEmail.length,
    councilTotal: councilTotal.count ?? 0,
    allMembers: members.count ?? 0,
    ownClubMembers: ownMembers.count ?? 0,
  };
}
