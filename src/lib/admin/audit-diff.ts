/**
 * Turns an audit row's `before` / `after` snapshots into a field-by-field
 * "from → to" list for the audit page. Pure: ids are resolved through the
 * `names` map the caller builds, and every value comes back display-ready.
 *
 * - Both snapshots present → only the fields `after` records whose value moved.
 * - Only `after` (a create, an open, an export…) → every field, as "set".
 * - Only `before` (a delete) → every field, as "removed".
 */
import { canonicalJson } from "@/lib/json";
import { istDateMedium, istTime } from "@/lib/datetime";

export interface AuditChange {
  field: string;
  label: string;
  kind: "changed" | "set" | "removed";
  /** Display text; null means "empty". */
  from: string | null;
  to: string | null;
}

const LABELS: Record<string, string> = {
  venue_text: "Venue",
  starts_at: "Starts",
  ends_at: "Ends",
  club_id: "Club",
  clubId: "Club",
  eventId: "Event",
  memberId: "Member",
  headId: "Head",
  viceHeadId: "Vice head",
  primary_club_id: "Primary club",
  cohost_ids: "Co-hosts",
  selection_mode: "Selection mode",
  registration_opens_at: "Registration opens",
  registration_closes_at: "Registration closes",
  registration_form: "Registration form",
  waitlist_enabled: "Waitlist",
  show_on_achievements: "Show on achievements",
  whatsapp_url: "WhatsApp link",
  approval_status: "Approval",
  isActive: "Active",
  isPublic: "Public",
  happenedOn: "Date",
  handledAt: "Handled at",
  windowSeconds: "Window (seconds)",
  bioChars: "Bio length",
};

/** "registration_opens_at" / "viceHeadId" → "Registration opens at" / "Vice head id". */
export function fieldLabel(key: string): string {
  if (LABELS[key]) return LABELS[key];
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Comparison key: the same instant written two ways ("…+00:00" vs "….000Z") is equal. */
function sameKey(v: unknown): string {
  if (v === undefined || v === null || v === "") return "∅";
  if (typeof v === "string" && ISO_INSTANT.test(v)) return `t:${new Date(v).getTime()}`;
  if (typeof v === "object") return canonicalJson(v);
  return JSON.stringify(v);
}

function formatValue(v: unknown, names: ReadonlyMap<string, string>): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    if (ISO_INSTANT.test(v)) return `${istDateMedium(v)}, ${istTime(v)}`;
    if (DAY_KEY.test(v)) return istDateMedium(v);
    if (UUID.test(v)) return names.get(v) ?? v;
    return v;
  }
  if (Array.isArray(v)) {
    if (!v.length) return null;
    return v.map((x) => formatValue(x, names) ?? "—").join(", ");
  }
  return JSON.stringify(v);
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export function diffAudit(
  before: unknown,
  after: unknown,
  names: ReadonlyMap<string, string> = new Map(),
): AuditChange[] {
  const b = asRecord(before);
  const a = asRecord(after);
  const change = (field: string, kind: AuditChange["kind"], from: unknown, to: unknown): AuditChange => ({
    field,
    label: fieldLabel(field),
    kind,
    from: formatValue(from, names),
    to: formatValue(to, names),
  });

  if (a && !b) return Object.entries(a).map(([k, v]) => change(k, "set", undefined, v));
  if (b && !a) return Object.entries(b).map(([k, v]) => change(k, "removed", v, undefined));
  if (!a || !b) return [];

  // Only keys the `after` snapshot records can have changed. Producers often
  // put context in `before` alone (a member's name next to `after: { onboarded }`,
  // or fields a narrower role can't edit) — absent from `after` means "not
  // recorded", never "cleared". A key new in `after` is a value being set.
  return Object.keys(a)
    .filter((k) => sameKey(b[k]) !== sameKey(a[k]))
    .map((k) => (k in b ? change(k, "changed", b[k], a[k]) : change(k, "set", undefined, a[k])));
}

/** Every uuid in a snapshot — the ids the caller should resolve to names. */
export function idsIn(snapshot: unknown): string[] {
  const out: string[] = [];
  const visit = (v: unknown) => {
    if (typeof v === "string" && UUID.test(v)) out.push(v);
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") Object.values(v).forEach(visit);
  };
  visit(snapshot);
  return out;
}
