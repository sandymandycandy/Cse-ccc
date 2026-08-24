import type { Database } from "@/lib/database.types";

/** Pure, client-safe resource helpers (no I/O) — shared by the admin form
 *  (client), the admin list, and the public page. Keep free of `server-only`
 *  imports so the client `ResourceForm` can use it. */

export type ResourceKind = Database["public"]["Enums"]["resource_kind"];

/** Display label for each `resource_kind` enum value, in display order. */
export const RESOURCE_KINDS: { value: ResourceKind; label: string }[] = [
  { value: "drive", label: "Drive folder" },
  { value: "doc", label: "Document" },
  { value: "template", label: "Template" },
];

export function resourceKindLabel(kind: ResourceKind): string {
  return RESOURCE_KINDS.find((k) => k.value === kind)?.label ?? kind;
}
