"use client";

import { useState } from "react";
import { BASE_LABEL, baseImpactText, type BaseImpact, type BaseKind, type BaseSummary } from "@/lib/certificates/bases";

/** Pick which council bases this design becomes, see who it reaches, confirm (spec 2026-09-15 §1.3, §5). */
export function SaveAsBasePanel({
  savable,
  defaultKind,
  bases,
  impact,
  busy,
  onSave,
  onClose,
}: {
  savable: BaseKind[];
  defaultKind: BaseKind | null;
  bases: Record<BaseKind, BaseSummary>;
  impact: Partial<Record<BaseKind, BaseImpact>>;
  busy: boolean;
  onSave: (targets: BaseKind[]) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<BaseKind[]>(defaultKind && savable.includes(defaultKind) ? [defaultKind] : []);
  const toggle = (kind: BaseKind) =>
    setPicked((current) => (current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind]));

  return (
    <div className="cd-confirm" style={{ marginTop: 10 }}>
      <p className="body-text">
        <strong>Save this design as a council base.</strong> Every event that hasn&rsquo;t customised that group uses it.
      </p>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 8 }}>
        <legend className="label">Save as</legend>
        {savable.map((kind) => (
          <label key={kind} className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={picked.includes(kind)} onChange={() => toggle(kind)} style={{ width: "auto" }} />
            <span>
              {BASE_LABEL[kind]} base
              {picked.includes(kind) ? <span className="hint"> — {baseImpactText(impact[kind], bases[kind].exists)}</span> : null}
            </span>
          </label>
        ))}
      </fieldset>
      <p className="hint">Certificates already issued keep the design they were issued with.</p>
      <div className="stack">
        <button type="button" className="btn btn-accent btn-sm" disabled={busy || picked.length === 0} onClick={() => onSave(picked)}>
          {busy ? "Saving…" : "Save as base"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
