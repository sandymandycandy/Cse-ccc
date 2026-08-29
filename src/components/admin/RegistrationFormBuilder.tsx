"use client";

import { useMemo, useState } from "react";
import {
  CHOICE_KINDS,
  defaultFormFor,
  type FieldKind,
  type FormField,
  type Identity,
} from "@/lib/registration-form/schema";
import { DEPARTMENTS } from "@/lib/departments";

const IDENTITY_BLOCKS: { identity: Identity; kind: FieldKind; label: string; options?: string[] }[] = [
  { identity: "name", kind: "short_text", label: "Full name" },
  { identity: "roll", kind: "short_text", label: "Roll number" },
  { identity: "email", kind: "short_text", label: "College email" },
  { identity: "phone", kind: "short_text", label: "Mobile number" },
  { identity: "department", kind: "dropdown", label: "Department", options: [...DEPARTMENTS] },
  { identity: "year", kind: "dropdown", label: "Year", options: ["1", "2", "3", "4", "5"] },
];

const CUSTOM_KINDS: { kind: FieldKind; label: string }[] = [
  { kind: "short_text", label: "Short text" },
  { kind: "paragraph", label: "Paragraph" },
  { kind: "dropdown", label: "Dropdown" },
  { kind: "radio", label: "Multiple choice" },
  { kind: "checkboxes", label: "Checkboxes" },
  { kind: "date", label: "Date" },
  { kind: "number", label: "Number" },
  { kind: "link", label: "Link (Drive/URL)" },
];

let counter = 0;
const newId = () => `q${Date.now().toString(36)}${(counter++).toString(36)}`;

export function RegistrationFormBuilder({ initialJson }: { initialJson: string }) {
  const [fields, setFields] = useState<FormField[]>(() => {
    try {
      const parsed = JSON.parse(initialJson);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as FormField[];
    } catch {
      /* fall through */
    }
    return defaultFormFor();
  });

  const usedIdentities = useMemo(
    () => new Set(fields.map((f) => f.identity).filter(Boolean) as Identity[]),
    [fields],
  );
  const json = useMemo(() => JSON.stringify(fields), [fields]);

  function update(i: number, patch: Partial<FormField>) {
    setFields((f) => f.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
  function move(i: number, dir: -1 | 1) {
    setFields((f) => {
      const j = i + dir;
      if (j < 0 || j >= f.length) return f;
      const copy = [...f];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }
  function remove(i: number) {
    setFields((f) => f.filter((_, idx) => idx !== i));
  }
  function addIdentity(b: (typeof IDENTITY_BLOCKS)[number]) {
    setFields((f) => [
      ...f,
      {
        id: b.identity,
        kind: b.kind,
        identity: b.identity,
        label: b.label,
        required: true,
        options: b.options ? [...b.options] : undefined,
      },
    ]);
  }
  function addCustom(kind: FieldKind) {
    setFields((f) => [
      ...f,
      {
        id: newId(),
        kind,
        identity: null,
        label: "Untitled question",
        required: false,
        options: CHOICE_KINDS.has(kind) ? ["Option 1"] : undefined,
      },
    ]);
  }

  return (
    <div className="field">
      <label>Registration form</label>
      <span className="hint">
        Build the questions applicants answer. Identity blocks power duplicate-check, attendance and
        the shortlist email.
      </span>
      <input type="hidden" name="registrationForm" value={json} readOnly />

      <div className="stack" style={{ gap: 10, marginTop: 10 }}>
        {fields.map((field, i) => (
          <div key={field.id} className="card" style={{ padding: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                aria-label="Label"
                value={field.label}
                onChange={(e) => update(i, { label: e.target.value })}
                style={{ flex: 1 }}
                disabled={!!field.identity}
              />
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => move(i, -1)}>
                ↑
              </button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => move(i, 1)}>
                ↓
              </button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => remove(i)}>
                ✕
              </button>
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 8, alignItems: "center" }}>
              <span className="label">
                {field.identity ? `${field.identity} · ${field.kind}` : field.kind}
              </span>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 400 }}>
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) => update(i, { required: e.target.checked })}
                />{" "}
                Required
              </label>
            </div>
            {!field.identity && CHOICE_KINDS.has(field.kind) ? (
              <textarea
                style={{ marginTop: 8 }}
                rows={3}
                aria-label="Options (one per line)"
                value={(field.options ?? []).join("\n")}
                onChange={(e) =>
                  update(i, {
                    options: e.target.value
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="One option per line"
              />
            ) : null}
            {!field.identity ? (
              <input
                style={{ marginTop: 8 }}
                aria-label="Help text"
                value={field.help ?? ""}
                onChange={(e) => update(i, { help: e.target.value })}
                placeholder="Help text (optional)"
              />
            ) : null}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="label">Add identity block</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
          {IDENTITY_BLOCKS.map((b) => (
            <button
              key={b.identity}
              type="button"
              className="btn btn-sm btn-ghost"
              disabled={usedIdentities.has(b.identity)}
              onClick={() => addIdentity(b)}
            >
              + {b.label}
            </button>
          ))}
        </div>
        <div className="label" style={{ marginTop: 10 }}>
          Add question
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
          {CUSTOM_KINDS.map((c) => (
            <button
              key={c.kind}
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => addCustom(c.kind)}
            >
              + {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
