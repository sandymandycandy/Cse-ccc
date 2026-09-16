import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { listRegistrations, getEventFormSchema } from "@/lib/admin/registrations";
import { teamRecipients } from "@/lib/registration-form/recipients";
import { splitRegistrations } from "@/lib/registration/waitlist";
import { OFFICE_BEARER_ROLES, dedupeRecipients, type Audience } from "./broadcast-audience";
import { ADMIN_ROLE_LABEL, MEMBER_ROLE_LABEL, describeRecipient } from "./role-labels";

export interface Recipient {
  email: string;
  name: string | null;
  /**
   * "Club Head · AI Forge" — what this person is, and where, for the picker.
   *
   * Display only: the send path reads `email` and `name` and ignores this. Null
   * whenever there is nothing useful to say, e.g. an event registrant, who
   * belongs to no club through any table we have.
   */
  meta?: string | null;
}

/** id → display name for every club, built once per resolve that needs it. */
async function clubNames(
  admin: ReturnType<typeof createAdminClient>,
): Promise<Map<string, string>> {
  const { data } = await admin.from("clubs").select("id, name, short_name");
  return new Map((data ?? []).map((c) => [c.id, c.short_name || c.name]));
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
    const [{ data }, clubs] = await Promise.all([
      admin
        .from("admin_users")
        .select("email, full_name, role, club_id")
        .in("role", ["club_head", "vice_head"])
        .eq("is_active", true),
      clubNames(admin),
    ]);
    // Which club's head — the whole point of listing 26 of them is telling them
    // apart, and a name alone does not.
    return dedupeRecipients(
      (data ?? []).map((r) => ({
        email: r.email,
        name: r.full_name,
        meta: describeRecipient(
          ADMIN_ROLE_LABEL[r.role],
          r.club_id ? clubs.get(r.club_id) : null,
        ),
      })),
    );
  }

  // Typed in by hand, so there is no roster row to take a name from. The
  // template greets an unnamed recipient with a plain "Hi," — better than
  // guessing a name from the local part of their address.
  if (a.kind === "custom") {
    return dedupeRecipients(a.emails.map((email) => ({ email, name: null })));
  }

  if (a.kind === "office_bearers") {
    const { data } = await admin
      .from("admin_users")
      .select("email, full_name, role")
      .in("role", [...OFFICE_BEARER_ROLES])
      .eq("is_active", true);
    // No club: an office-bearer holds a council post, not a club one. The post
    // IS the identifying fact here.
    return dedupeRecipients(
      (data ?? []).map((r) => ({
        email: r.email,
        name: r.full_name,
        meta: describeRecipient(ADMIN_ROLE_LABEL[r.role], null),
      })),
    );
  }

  if (a.kind === "council") {
    const [{ data }, clubs] = await Promise.all([
      admin
        .from("council_members")
        .select("email, full_name, designation, club_id")
        .eq("is_active", true)
        .not("approved_at", "is", null),
      clubNames(admin),
    ]);
    // `designation` is free text a human typed ("Robotics Club Head"), not an
    // enum, so it is shown as written rather than mapped.
    return dedupeRecipients(
      (data ?? []).map((r) => ({
        email: r.email ?? "",
        name: r.full_name,
        meta: describeRecipient(r.designation, r.club_id ? clubs.get(r.club_id) : null),
      })),
    );
  }

  if (a.kind === "club_members" || a.kind === "all_members") {
    const base = admin.from("club_members").select("email, name, role, club_id");
    const [{ data }, clubs] = await Promise.all([
      a.kind === "club_members" ? base.eq("club_id", a.clubId) : base,
      // ⚠️ Only worth a query when the audience spans clubs. Under
      // `club_members` every row is the club chosen in the picker above, so
      // repeating it 236 times is noise, not information.
      a.kind === "all_members" ? clubNames(admin) : Promise.resolve(null),
    ]);
    return dedupeRecipients(
      (data ?? []).map((r) => ({
        email: r.email ?? "",
        name: r.name,
        meta: describeRecipient(
          MEMBER_ROLE_LABEL[r.role],
          clubs && r.club_id ? clubs.get(r.club_id) : null,
        ),
      })),
    );
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
  officeBearers: number;
  allMembers: number;
  ownClubMembers: number;
}> {
  const admin = createAdminClient();
  const [heads, councilTotal, members, ownMembers, councilWithEmail, officeBearers] =
    await Promise.all([
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
    // Layer 2. A vacant post contributes nobody, so this is the live number of
    // people the audience actually reaches, not the number of seats.
    admin
      .from("admin_users")
      .select("id", { count: "exact", head: true })
      .in("role", [...OFFICE_BEARER_ROLES])
      .eq("is_active", true),
  ]);

  return {
    heads: heads.count ?? 0,
    council: councilWithEmail.length,
    councilTotal: councilTotal.count ?? 0,
    officeBearers: officeBearers.count ?? 0,
    allMembers: members.count ?? 0,
    ownClubMembers: ownMembers.count ?? 0,
  };
}
