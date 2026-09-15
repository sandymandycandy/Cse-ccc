import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ListRow } from "@/lib/certificates/sheet";

/**
 * People typed into a list group, one at a time (spec 2026-09-15 §1.4). Same
 * table as uploaded rows, so issuing treats both identically. Service role —
 * callers check the capability and that the group belongs to the event.
 */

type Person = { name: string; email: string | null; roll: string | null };

export async function getListRow(groupId: string, rowId: string): Promise<ListRow | null> {
  const { data } = await createAdminClient()
    .from("certificate_sheet_rows")
    .select("id, row_no, name, email, roll, data")
    .eq("group_id", groupId)
    .eq("id", rowId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    row_no: data.row_no,
    name: data.name,
    email: data.email,
    roll: data.roll,
    data: (data.data ?? {}) as Record<string, string>,
  };
}

export async function countListRows(groupId: string): Promise<number> {
  const { count } = await createAdminClient()
    .from("certificate_sheet_rows")
    .select("id", { count: "exact", head: true })
    .eq("group_id", groupId);
  return count ?? 0;
}

export async function addListRow(groupId: string, person: Person): Promise<{ id: string } | { error: string }> {
  const admin = createAdminClient();
  const { data: last } = await admin
    .from("certificate_sheet_rows")
    .select("row_no")
    .eq("group_id", groupId)
    .order("row_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await admin
    .from("certificate_sheet_rows")
    .insert({
      group_id: groupId,
      row_no: (last?.row_no ?? 0) + 1,
      name: person.name,
      email: person.email,
      roll: person.roll,
      data: {},
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Could not add that person. Try again." };
  return { id: data.id };
}

export async function updateListRow(groupId: string, rowId: string, person: Person): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("certificate_sheet_rows")
    .update({ name: person.name, email: person.email, roll: person.roll })
    .eq("group_id", groupId)
    .eq("id", rowId)
    .select("id");
  return !error && (data?.length ?? 0) > 0;
}

export async function removeListRow(groupId: string, rowId: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("certificate_sheet_rows")
    .delete()
    .eq("group_id", groupId)
    .eq("id", rowId)
    .select("id");
  return !error && (data?.length ?? 0) > 0;
}

/**
 * Does a live certificate exist under this list identity — or a `#n` duplicate
 * of it (recipients.ts `unique`)? Conservative on purpose: a false "yes" only
 * refuses an edit, a false "no" would give one person two live certificates.
 */
export async function hasLiveListCertificate(eventId: string, groupId: string, identity: string): Promise<boolean> {
  const admin = createAdminClient();
  const key = `sheet:${groupId}:${identity}`;
  const pattern = `${key.replace(/[\\%_]/g, (c) => `\\${c}`)}#%`;
  const [exact, numbered] = await Promise.all([
    admin
      .from("certificates")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .is("revoked_at", null)
      .eq("recipient_key", key),
    admin
      .from("certificates")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .is("revoked_at", null)
      .like("recipient_key", pattern),
  ]);
  if (exact.error || numbered.error) throw new Error("Could not check this person's certificates.");
  return (exact.count ?? 0) + (numbered.count ?? 0) > 0;
}
