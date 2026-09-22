"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronDown, ListPlus, Plus, Search, ShieldCheck, Trash2, Undo2, X } from "lucide-react";
import { canRestoreField, moveFormField, restoreFormField } from "@/lib/registration-form/builder";
import {
  CHOICE_KINDS,
  defaultFormFor,
  MAX_MEMBERS,
  MAX_FIELDS,
  MAX_SUBFIELDS,
  type FieldKind,
  type FormField,
  type Identity,
  type MemberSubfield,
} from "@/lib/registration-form/schema";
import { DEPARTMENTS } from "@/lib/departments";
import "./registration-form-builder.css";

const IDENTITY_BLOCKS: { identity: Identity; kind: FieldKind; label: string; options?: string[]; allowOther?: boolean }[] = [
  { identity: "name", kind: "short_text", label: "Full name" },
  { identity: "roll", kind: "short_text", label: "Roll number" },
  { identity: "email", kind: "short_text", label: "College email" },
  { identity: "phone", kind: "short_text", label: "Mobile number" },
  { identity: "department", kind: "dropdown", label: "Department", options: [...DEPARTMENTS], allowOther: true },
  { identity: "year", kind: "dropdown", label: "Year", options: ["1", "2", "3", "4", "5"] },
  // Describes the entry, not the person. Only meaningful alongside a team block.
  { identity: "team_name", kind: "short_text", label: "Team name" },
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

export function RegistrationFormBuilder({
  initialJson,
  onCountChange,
  onEdit,
}: {
  initialJson: string;
  onCountChange?: (count: number) => void;
  /** Only schema edits, not searching or opening a card, mark the event dirty. */
  onEdit?: () => void;
}) {
  const [fields, setFields] = useState<FormField[]>(() => {
    try {
      const parsed = JSON.parse(initialJson);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as FormField[];
    } catch { /* Use the existing default schema for a new event. */ }
    return defaultFormFor();
  });
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [removed, setRemoved] = useState<{ field: FormField; index: number } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const summaryRefs = useRef<Record<string, HTMLElement | null>>({});
  const searchRef = useRef<HTMLInputElement>(null);
  const usedIdentities = useMemo(
    () => new Set(fields.map((f) => f.identity).filter(Boolean) as Identity[]), [fields],
  );
  const json = useMemo(() => JSON.stringify(fields), [fields]);
  useEffect(() => { onCountChange?.(fields.length); }, [fields.length, onCountChange]);

  const q = query.trim().toLowerCase();
  const typeLabel = (kind: FieldKind) => CUSTOM_KINDS.find((item) => item.kind === kind)?.label
    ?? (kind === "team" ? "Team members" : "Section heading");
  const matches = (field: FormField) => !q ||
    (field.label + " " + typeLabel(field.kind) + " " + (field.identity ?? "")).toLowerCase().includes(q);
  const hitCount = fields.filter(matches).length;
  const atLimit = fields.length >= MAX_FIELDS;
  const requiredCount = fields.filter((field) => field.required && field.kind !== "section").length;
  const sectionCount = fields.filter((field) => field.kind === "section").length;

  function commit(next: FormField[]) {
    setFields(next);
    onEdit?.();
  }
  function focusCard(id: string) {
    requestAnimationFrame(() => {
      summaryRefs.current[id]?.focus();
      summaryRefs.current[id]?.scrollIntoView({ block: "nearest" });
    });
  }
  function update(index: number, patch: Partial<FormField>) {
    commit(fields.map((field, i) => i === index ? { ...field, ...patch } : field));
  }
  function move(index: number, direction: -1 | 1) {
    const next = moveFormField(fields, index, direction);
    if (next === fields) return;
    commit(next);
    setAnnouncement(fields[index].label + " moved to position " + (index + direction + 1) + ".");
  }
  function remove(index: number) {
    setRemoved({ field: fields[index], index });
    commit(fields.filter((_, i) => i !== index));
    setAnnouncement(fields[index].label + " removed. Use Undo to restore it.");
    const next = fields[index + 1] ?? fields[index - 1];
    if (next) focusCard(next.id);
    else searchRef.current?.focus();
  }
  function undo() {
    if (!removed || !canRestoreField(fields, removed.field)) return;
    commit(restoreFormField(fields, removed.field, removed.index));
    setQuery("");
    setAnnouncement(removed.field.label + " restored.");
    focusCard(removed.field.id);
    setRemoved(null);
  }
  function append(field: FormField) {
    if (atLimit || (field.identity && usedIdentities.has(field.identity))) return;
    commit([...fields, field]);
    setQuery("");
    setExpanded((current) => new Set([...current, field.id]));
    setPickerOpen(false);
    setAnnouncement(field.label + " added.");
    focusCard(field.id);
  }
  function addIdentity(block: (typeof IDENTITY_BLOCKS)[number]) {
    append({ id: block.identity, kind: block.kind, identity: block.identity, label: block.label,
      required: true, options: block.options ? [...block.options] : undefined, allowOther: block.allowOther });
  }
  function addCustom(kind: FieldKind) {
    append({ id: newId(), kind, identity: null, label: "Untitled question", required: false,
      options: CHOICE_KINDS.has(kind) ? ["Option 1"] : undefined });
  }
  function toggleCard(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="rfb-builder" onChange={(event) => event.stopPropagation()}>
      <input type="hidden" name="registrationForm" value={json} readOnly />
      <span className="sr-only" role="status">{announcement}</span>
      <div className="rfb-overview">
        <div><strong>{fields.length - sectionCount} questions</strong><span>{requiredCount} required{sectionCount ? " ? " + sectionCount + " sections" : ""}</span></div>
        <button type="button" className="btn btn-primary btn-sm" aria-expanded={pickerOpen} aria-controls="rfb-picker" onClick={() => setPickerOpen(!pickerOpen)}><Plus size={16} aria-hidden="true" /> Add question</button>
      </div>
      <div className="rfb-picker" id="rfb-picker" hidden={!pickerOpen}>
        <div className="rfb-picker-heading"><h3>Add to your form</h3><button type="button" className="rfb-icon-btn" aria-label="Close question picker" onClick={() => setPickerOpen(false)}><X size={16} aria-hidden="true" /></button></div>
        {atLimit ? <p className="rfb-limit" role="status">This form has reached its limit of {MAX_FIELDS} items. Remove an item before adding another.</p> : null}
        <fieldset><legend>Participant details</legend><p>These fields connect registrations to attendance and email.</p><div className="rfb-palette">
          {IDENTITY_BLOCKS.map((block) => <button key={block.identity} type="button" disabled={atLimit || usedIdentities.has(block.identity)} onClick={() => addIdentity(block)}>
            {usedIdentities.has(block.identity) ? <Check size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}{block.label}{usedIdentities.has(block.identity) ? <span className="sr-only"> (already added)</span> : null}
          </button>)}
        </div></fieldset>
        <fieldset><legend>Custom questions</legend><div className="rfb-palette">
          {CUSTOM_KINDS.map((item) => <button key={item.kind} type="button" disabled={atLimit} onClick={() => addCustom(item.kind)}><Plus size={14} aria-hidden="true" />{item.label}</button>)}
        </div></fieldset>
        <fieldset><legend>Structure & teams</legend><div className="rfb-palette">
          <button type="button" disabled={atLimit} onClick={() => append({ id: newId(), kind: "section", identity: null, label: "Section title", required: false, description: "" })}><ListPlus size={15} aria-hidden="true" />Section heading</button>
          <button type="button" disabled={atLimit} onClick={() => append({ id: newId(), kind: "team", identity: null, label: "Team members", required: false, minMembers: 1, maxMembers: 4, members: [
            { key: "name", label: "Name", kind: "short_text", required: true },
            { key: "email", label: "Email", kind: "email", required: true },
          ] })}><Plus size={14} aria-hidden="true" />Team members</button>
        </div></fieldset>
      </div>
      <div className="rfb-toolbar">
        <div className="rfb-search-wrap"><Search size={16} aria-hidden="true" /><input ref={searchRef} type="search" className="rfb-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a question?" aria-label="Search questions" />
          {query ? <button type="button" className="rfb-icon-btn" aria-label="Clear question search" onClick={() => { setQuery(""); searchRef.current?.focus(); }}><X size={15} aria-hidden="true" /></button> : null}
        </div>
        <button type="button" className="rfb-text-btn" onClick={() => { setQuery(""); setExpanded(expanded.size ? new Set() : new Set(fields.map((field) => field.id))); }}>{expanded.size ? "Collapse all" : "Expand all"}</button>
      </div>
      {q ? <p className="rfb-results" role="status">{hitCount} of {fields.length} items match</p> : null}
      {removed ? <div className="rfb-undo"><span>Removed ?{removed.field.label}?</span><button type="button" className="rfb-text-btn" disabled={!canRestoreField(fields, removed.field)} onClick={undo}><Undo2 size={14} aria-hidden="true" /> Undo</button>
        {!canRestoreField(fields, removed.field) ? <small>That field is already present, or the form is full.</small> : null}
      </div> : null}
      {hitCount === 0 ? <div className="rfb-nomatch"><ListPlus size={24} aria-hidden="true" /><strong>{fields.length ? "No matching questions" : "Start your registration form"}</strong><p>{fields.length ? "Try a different name or clear your search." : "Add participant details, custom questions or a team block."}</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => fields.length ? setQuery("") : setPickerOpen(true)}>{fields.length ? "Clear search" : "Add your first question"}</button>
      </div> : null}
      <div className="rfb-question-list">
        {fields.map((field, index) => (
          <details key={field.id} className="rfb-question" open={!!q || expanded.has(field.id)} hidden={!matches(field)}>
            <summary ref={(node) => { summaryRefs.current[field.id] = node; }} onClick={(event) => { event.preventDefault(); if (!q) toggleCard(field.id); }}>
              <span className="rfb-position">{String(index + 1).padStart(2, "0")}</span>
              <span className="rfb-question-title"><strong>{field.label || "Untitled question"}</strong><small>{field.identity ? "Participant detail" : typeLabel(field.kind)}</small></span>
              {field.required && field.kind !== "section" ? <span className="rfb-required-tag">Required</span> : null}
              <ChevronDown size={16} className="rfb-chevron" aria-hidden="true" />
            </summary>
            <div className="rfb-question-body field">
              <div className="rfb-question-tools"><span>{typeLabel(field.kind)}</span><div>
                <button type="button" className="rfb-icon-btn" disabled={index === 0} aria-label={"Move " + field.label + " up"} title="Move up" onClick={() => move(index, -1)}><ArrowUp size={16} aria-hidden="true" /></button>
                <button type="button" className="rfb-icon-btn" disabled={index === fields.length - 1} aria-label={"Move " + field.label + " down"} title="Move down" onClick={() => move(index, 1)}><ArrowDown size={16} aria-hidden="true" /></button>
                <button type="button" className="rfb-icon-btn rfb-remove" aria-label={"Remove " + field.label} title="Remove question" onClick={() => remove(index)}><Trash2 size={16} aria-hidden="true" /></button>
              </div></div>
              <label htmlFor={"rfb-label-" + field.id}>{field.kind === "section" ? "Section title" : "Question title"}</label>
              <input id={"rfb-label-" + field.id} value={field.label} maxLength={120} onChange={(event) => update(index, { label: event.target.value })} disabled={!!field.identity} />
              {field.identity ? <p className="rfb-identity-note"><ShieldCheck size={15} aria-hidden="true" />The title is fixed so this field stays linked to participant records.</p> : null}
              {field.kind !== "section" ? <label className="rfb-check"><input type="checkbox" checked={field.required} onChange={(event) => update(index, { required: event.target.checked })} />Answer required</label> : null}
              {!field.identity && CHOICE_KINDS.has(field.kind) ? <div className="rfb-options"><span className="rfb-control-label">Answer options</span>
                {(field.options ?? []).map((option, optionIndex) => <div className="rfb-option" key={optionIndex}><span>{optionIndex + 1}</span><input aria-label={"Option " + (optionIndex + 1) + " for " + field.label} value={option} onChange={(event) => update(index, { options: (field.options ?? []).map((value, i) => i === optionIndex ? event.target.value : value) })} /><button type="button" className="rfb-icon-btn" disabled={(field.options?.length ?? 0) <= 1} aria-label={"Remove option " + (optionIndex + 1) + " from " + field.label} onClick={() => update(index, { options: field.options?.filter((_, i) => i !== optionIndex) })}><X size={15} aria-hidden="true" /></button></div>)}
                <button type="button" className="rfb-text-btn" disabled={(field.options?.length ?? 0) >= 20} onClick={() => update(index, { options: [...(field.options ?? []), ""] })}><Plus size={14} aria-hidden="true" /> Add option</button><span className="rfb-option-count">{field.options?.length ?? 0} / 20</span>
                <label className="rfb-check"><input type="checkbox" checked={!!field.allowOther} onChange={(event) => update(index, { allowOther: event.target.checked })} />Allow an ?Other? answer</label>
              </div> : null}
              {field.kind === "section" ? <label className="rfb-extra">Description <span>(optional)</span><textarea rows={2} maxLength={500} value={field.description ?? ""} onChange={(event) => update(index, { description: event.target.value })} placeholder="Introduce the next group of questions" /></label> : null}
              {field.kind === "team" ? <TeamEditor field={field} onChange={(patch) => update(index, patch)} /> : null}
              {!field.identity && field.kind !== "section" ? <label className="rfb-extra">Help text <span>(optional)</span><input value={field.help ?? ""} maxLength={300} onChange={(event) => update(index, { help: event.target.value })} placeholder="Add a short instruction for participants" /></label> : null}
            </div>
          </details>
        ))}
      </div>
      <p className="rfb-footer-note">Question order matches the registration form. Save the event to publish your changes.</p>
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
      <div className="rfb-minmax">
        <label style={{ fontWeight: 400 }}>
          Minimum members
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
          Maximum members
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
      <div className="rfb-member-list">
        {members.map((m, idx) => (
          <div key={m.key} className="rfb-member">
            <input
              aria-label={"Member field " + (idx + 1) + " label"}
              maxLength={80}
              value={m.label}
              onChange={(e) => setMember(idx, { label: e.target.value })}
            />
            <select
              aria-label={"Member field " + (idx + 1) + " type"}
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
            <button type="button" className="rfb-icon-btn rfb-remove" aria-label={"Remove member field " + m.label} disabled={members.length <= 1} onClick={() => removeMember(idx)}>
              <Trash2 size={15} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: 6 }} disabled={members.length >= MAX_SUBFIELDS} onClick={addMember}>
        + Member field
      </button>
    </div>
  );
}
