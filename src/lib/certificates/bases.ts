import { canManage, type AdminIdentity, type Capability } from "@/lib/auth/capabilities";
import { CERT_ASSET_BUCKET, emptyDesign, type AssetRef, type Design } from "./design";

/**
 * Council-wide base designs (spec 2026-09-15 §1–§5). Pure: which bases exist,
 * who may overwrite them, what a base may contain, and which design a group
 * prints with while it follows one.
 */

export const BASE_KINDS = ["participants", "volunteers", "winners"] as const;
export type BaseKind = (typeof BASE_KINDS)[number];

/** Bases this build offers. */
export const ENABLED_BASE_KINDS: readonly BaseKind[] = ["participants", "volunteers", "winners"];

export const BASE_LABEL: Record<BaseKind, string> = {
  participants: "Participants",
  volunteers: "Volunteers",
  winners: "Winners",
};

/**
 * Where a base's images live in the asset bucket. The nil UUID matches the
 * design validator's `<uuid>/<uuid>.<ext>` path rule, and no event can have it,
 * so a base never depends on an event's objects.
 */
export const BASE_ASSET_FOLDER = "00000000-0000-0000-0000-000000000000";

export interface BaseDesign {
  kind: BaseKind;
  design: Design;
  sourceEventTitle: string | null;
  updatedAt: string;
}

/** What the page needs to know about a base without its design. */
export interface BaseSummary {
  kind: BaseKind;
  label: string;
  exists: boolean;
  sourceEventTitle: string | null;
  updatedAt: string | null;
}

export interface BaseImpact {
  /** Other events whose group follows this base. */
  following: number;
  /** How many of those have at least one live certificate. */
  withLive: number;
}

/** The design a group prints with: its own once customised, else its base's, else empty. */
export function effectiveDesign(
  group: { customDesign: Design | null; baseKind: BaseKind | null },
  bases: ReadonlyMap<BaseKind, BaseDesign>,
): Design {
  if (group.customDesign) return group.customDesign;
  return (group.baseKind ? bases.get(group.baseKind)?.design : undefined) ?? emptyDesign();
}

export function baseCapability(kind: BaseKind): Capability {
  return kind === "winners" ? "issue:winner_certificate" : "issue:participation_certificate";
}

/** Bases this admin may overwrite. `canManage` with no club is true only for an "all" grant (spec D7). */
export function savableBases(identity: AdminIdentity, kinds: readonly BaseKind[] = ENABLED_BASE_KINDS): BaseKind[] {
  return kinds.filter((kind) => canManage(identity, baseCapability(kind), null));
}

const EVENT_ONLY_FIELD = /^(form|sheet)\./;
const WINNER_FIELD = /^winner\./;

/** The first field a base can't carry, as the refusal to show; null when the design is fine (spec D6). */
export function baseFieldProblem(
  design: Design,
  targets: readonly BaseKind[],
  labelOf: (key: string) => string,
): string | null {
  const winnersOnly = targets.length > 0 && targets.every((kind) => kind === "winners");
  for (const el of design.elements) {
    if (el.type !== "text") continue;
    for (const paragraph of el.paragraphs) {
      for (const run of paragraph.runs) {
        if (run.kind !== "field") continue;
        if (EVENT_ONLY_FIELD.test(run.field)) {
          return `Remove {${labelOf(run.field)}} — a base can only use fields every event has.`;
        }
        if (WINNER_FIELD.test(run.field) && !winnersOnly) {
          return `Remove {${labelOf(run.field)}} — winner fields can only go in the Winners base.`;
        }
      }
    }
  }
  return null;
}

export const isBaseAsset = (ref: Pick<AssetRef, "bucket" | "path">): boolean =>
  ref.bucket === CERT_ASSET_BUCKET && ref.path.startsWith(`${BASE_ASSET_FOLDER}/`);

/** The line the Save-as-base confirm shows for one base. */
export function baseImpactText(impact: BaseImpact | undefined, exists: boolean): string {
  if (!exists) return "Every event without a custom design will use this.";
  const following = impact?.following ?? 0;
  const withLive = impact?.withLive ?? 0;
  if (following === 0) return "No other event follows this base right now.";
  const used = `Used by ${following} ${following === 1 ? "event" : "events"}.`;
  if (withLive === 0) return `${used} None has issued certificates yet.`;
  return `${used} ${withLive} of them ${withLive === 1 ? "has" : "have"} issued certificates that will show as outdated.`;
}

export function summarizeBases(bases: ReadonlyMap<BaseKind, BaseDesign>): Record<BaseKind, BaseSummary> {
  const one = (kind: BaseKind): BaseSummary => {
    const saved = bases.get(kind);
    return {
      kind,
      label: BASE_LABEL[kind],
      exists: !!saved,
      sourceEventTitle: saved?.sourceEventTitle ?? null,
      updatedAt: saved?.updatedAt ?? null,
    };
  };
  return { participants: one("participants"), volunteers: one("volunteers"), winners: one("winners") };
}
