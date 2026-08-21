import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";

/**
 * Append to the audit log (SECURITY_SPEC §14). Every admin mutation records who
 * did what, with optional before/after snapshots. Writing audit is best-effort:
 * a failed audit insert is logged but never blocks the action it describes —
 * losing the action would be worse than losing its record.
 */
export async function writeAudit(entry: {
  actorId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: Json;
  after?: Json;
  ip?: string | null;
  ua?: string | null;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("audit_log").insert({
    actor_id: entry.actorId,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ip: entry.ip ?? null,
    ua: entry.ua ?? null,
  });
  if (error) console.error("audit_log write failed:", error.message);
}
