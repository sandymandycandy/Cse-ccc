"use client";

import { useMemo, useState } from "react";
import {
  CHOICE_KINDS,
  defaultFormFor,
  MAX_MEMBERS,
  type FieldKind,
  type FormField,
  type Identity,
  type MemberSubfield,
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
  function addSection() {
    setFields((f) => [
      ...f,
      { id: newId(), kind: "section", identity: null, label: "Section title", required: false, description: "" },
    ]);
  }
  function addTeam() {
    setFields((f) => [
      ...f,
      {
        id: newId(), kind: "team", identity: null, label: "Team members", required: false,
        minMembers: 1, maxMembers: 4,
        members: [
          { key: "name", label: "Name", kind: "short_text", required: true },
          { key: "email", label: "Email", kind: "email", required: true },
        ],
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
              {field.kind !== "section" ? (
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(e) => update(i, { required: e.target.checked })}
                  />{" "}
                  Required
                </label>
              ) : null}
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
            {field.kind === "section" ? (
              <textarea
                style={{ marginTop: 8 }}
                rows={2}
                aria-label="Section description"
                value={field.description ?? ""}
                onChange={(e) => update(i, { description: e.target.value })}
                placeholder="Description (optional)"
              />
            ) : null}
            {!field.identity && CHOICE_KINDS.has(field.kind) ? (
              <label style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8, fontWeight: 400 }}>
                <input
                  type="checkbox"
                  checked={!!field.allowOther}
                  onChange={(e) => update(i, { allowOther: e.target.checked })}
                />{" "}
                Allow an &ldquo;Other&rdquo; write-in
              </label>
            ) : null}
            {field.kind === "team" ? (
              <TeamEditor field={field} onChange={(patch) => update(i, patch)} />
            ) : null}
            {!field.identity && field.kind !== "section" ? (
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
        <div className="label" style={{ marginTop: 10 }}>
          Add layout
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => addSection()}>
            + Section heading
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => addTeam()}>
            + Team members
          </button>
        </div>
      </div>
    </div>
  );
}

function TeamEditor({
  field,
  onChange,
}: {
  field: FormField;
  onChange: (patch: Partial<FormField>) => void;
}) {
  const members = field.members ?? [];
  const setMember = (idx: number, patch: Partial<MemberSubfield>) =>
    onChange({ members: members.map((m, k) => (k === idx ? { ...m, ...patch } : m)) });
  const addMember = () =>
    onChange({
      members: [
        ...members,
        { key: `m${Date.now().toString(36)}`, label: "Field", kind: "short_text", required: false },
      ],
    });
  const removeMember = (idx: number) => onChange({ members: members.filter((_, k) => k !== idx) });

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontWeight: 400 }}>
          Min
          <select
            value={field.minMembers ?? 1}
            onChange={(e) => {
              const min = Number(e.target.value);
              onChange({ minMembers: min, maxMembers: Math.max(min, field.maxMembers ?? 4) });
            }}
            style={{ marginLeft: 6 }}
          >
            {Array.from({ length: MAX_MEMBERS }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontWeight: 400 }}>
          Max
          <select
            value={field.maxMembers ?? 4}
            onChange={(e) => {
              const max = Number(e.target.value);
              onChange({ maxMembers: max, minMembers: Math.min(max, field.minMembers ?? 1) });
            }}
            style={{ marginLeft: 6 }}
          >
            {Array.from({ length: MAX_MEMBERS }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <span className="hint" style={{ marginTop: 6, display: "block" }}>
        Number of members to collect <strong>besides the team leader</strong> — the
        name/roll/email fields above capture the leader. (Team of 4 → set Max&nbsp;3.)
      </span>
      <div className="label" style={{ marginTop: 8 }}>
        Per-member fields
      </div>
      <div className="stack" style={{ gap: 6, marginTop: 4 }}>
        {members.map((m, idx) => (
          <div key={idx} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              aria-label="Member field label"
              value={m.label}
              style={{ flex: 1 }}
              onChange={(e) => setMember(idx, { label: e.target.value })}
            />
            <select
              aria-label="Member field type"
              value={m.kind}
              onChange={(e) => setMember(idx, { kind: e.target.value as MemberSubfield["kind"] })}
            >
              <option value="short_text">Text</option>
              <option value="email">Email</option>
              <option value="roll">VTU ID</option>
              <option value="phone">Phone</option>
            </select>
            <label style={{ display: "flex", gap: 4, alignItems: "center", fontWeight: 400 }}>
              <input
                type="checkbox"
                checked={m.required}
                onChange={(e) => setMember(idx, { required: e.target.checked })}
              />{" "}
              Req
            </label>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => removeMember(idx)}>
              ✕
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: 6 }} onClick={addMember}>
        + Member field
      </button>
    </div>
  );
}
