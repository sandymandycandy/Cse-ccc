import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";
import type { BaseDesign, BaseImpact, BaseKind } from "@/lib/certificates/bases";
import { parseStoredDesign, type Design } from "@/lib/certificates/design";

/**
 * The council's base designs (spec 2026-09-15 §2, §5). Service role only —
 * `certificate_bases` has no anon/authenticated privileges. Callers check the
 * capability first.
 */

/** Every saved base, by kind. A row whose design no longer parses counts as not saved. */
export async function loadBases(): Promise<Map<BaseKind, BaseDesign>> {
  const { data, error } = await createAdminClient()
    .from("certificate_bases")
    .select("kind, design, updated_at, events ( title )");
  if (error) throw error;
  const out = new Map<BaseKind, BaseDesign>();
  const rows = (data ?? []) as unknown as {
    kind: BaseKind;
    design: Json;
    updated_at: string;
    events: { title: string } | null;
  }[];
  for (const row of rows) {
    const design = parseStoredDesign(row.design);
    if (design) {
      out.set(row.kind, { kind: row.kind, design, sourceEventTitle: row.events?.title ?? null, updatedAt: row.updated_at });
    }
  }
  return out;
}

/** Who a base save reaches: other events following each base, and how many of them already issued. */
export async function baseImpact(
  kinds: readonly BaseKind[],
  exceptEventId: string,
): Promise<Partial<Record<BaseKind, BaseImpact>>> {
  if (kinds.length === 0) return {};
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("certificate_groups")
    .select("id, event_id, base_kind")
    .in("base_kind", [...kinds])
    .is("design", null)
    .neq("event_id", exceptEventId);
  if (error) throw error;
  const groups = (data ?? []) as { id: string; event_id: string; base_kind: BaseKind }[];

  const withLive = new Set<string>();
  const ids = groups.map((g) => g.id);
  for (let i = 0; i < ids.length; i += 200) {
    const { data: live, error: liveError } = await admin
      .from("certificates")
      .select("group_id")
      .in("group_id", ids.slice(i, i + 200))
      .is("revoked_at", null);
    if (liveError) throw liveError;
    for (const row of live ?? []) if (row.group_id) withLive.add(row.group_id);
  }

  const out: Partial<Record<BaseKind, BaseImpact>> = {};
  for (const kind of kinds) {
    // One group per (event, base) by index, so groups here are events.
    const mine = groups.filter((g) => g.base_kind === kind);
    out[kind] = { following: mine.length, withLive: mine.filter((g) => withLive.has(g.id)).length };
  }
  return out;
}

/** Upsert one base row per kind. Returns each kind's previous design (for the audit row) or a user-facing error. */
export async function writeBases(input: {
  kinds: readonly BaseKind[];
  design: Design;
  sourceEventId: string;
  actorId: string;
}): Promise<{ previous: Map<BaseKind, Json> } | { error: string }> {
  const admin = createAdminClient();
  const { data: before, error: readError } = await admin
    .from("certificate_bases")
    .select("kind, design")
    .in("kind", [...input.kinds]);
  if (readError) return { error: "Could not save the base. Try again." };

  const now = new Date().toISOString();
  const { error } = await admin.from("certificate_bases").upsert(
    input.kinds.map((kind) => ({
      kind,
      design: input.design as unknown as Json,
      source_event_id: input.sourceEventId,
      updated_by: input.actorId,
      updated_at: now,
    })),
    { onConflict: "kind" },
  );
  if (error) return { error: "Could not save the base. Try again." };
  return { previous: new Map((before ?? []).map((row) => [row.kind as BaseKind, row.design])) };
}

/** Make a base-slot group follow its base again (drop its own design). False when nothing changed. */
export async function followBase(eventId: string, groupId: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("certificate_groups")
    .update({ design: null, updated_at: new Date().toISOString() })
    .eq("id", groupId)
    .eq("event_id", eventId)
    .not("base_kind", "is", null)
    .select("id");
  return !error && (data?.length ?? 0) > 0;
}
