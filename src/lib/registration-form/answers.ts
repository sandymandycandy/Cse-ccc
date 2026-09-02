import { CHOICE_KINDS, LAYOUT_KINDS, type FormField, type MemberSubfield } from "./schema";
import { isSafeHttpUrl } from "@/lib/url";
import { DEPARTMENTS } from "@/lib/departments";

export type AnswerValue = string | number | string[] | Record<string, string>[];

/** Team names are free-form (clubs let students be creative), only bounded. */
const TEAM_NAME_MIN = 2;
const TEAM_NAME_MAX = 80;

export interface ValidatedAnswers {
  identity: {
    student_name?: string; roll_no?: string; email?: string;
    phone?: string; department?: string; year?: number; team_name?: string;
  };
  customAnswers: Record<string, AnswerValue>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLL_RE = /^[A-Z0-9]{6,15}$/;
const PHONE_RE = /^[6-9]\d{9}$/;
const NAME_RE = /^[\p{L}\p{M} .'-]+$/u;

export function validateAnswers(
  schema: FormField[],
  values: Record<string, unknown>,
): { ok: true; data: ValidatedAnswers } | { ok: false; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  const identity: ValidatedAnswers["identity"] = {};
  const customAnswers: Record<string, AnswerValue> = {};

  for (const field of schema) {
    if (LAYOUT_KINDS.has(field.kind)) continue; // section: no answer
    const raw = values[field.id];

    if (field.kind === "team") {
      const err = validateTeam(field, raw, customAnswers);
      if (err) fieldErrors[field.id] = err;
      continue;
    }

    const missing =
      raw == null || (typeof raw === "string" && raw.trim() === "") ||
      (Array.isArray(raw) && raw.length === 0);

    if (missing) {
      if (field.required) fieldErrors[field.id] = "This field is required.";
      continue;
    }

    // choice kinds
    if (CHOICE_KINDS.has(field.kind)) {
      const opts = field.options ?? [];
      const allowOther = !!field.allowOther;
      if (field.kind === "checkboxes") {
        const arr = (Array.isArray(raw) ? raw : [raw]).map((v) => String(v).trim()).filter(Boolean);
        const unknown = arr.filter((v) => !opts.includes(v));
        if (unknown.length > (allowOther ? 1 : 0)) { fieldErrors[field.id] = "Invalid choice."; continue; }
        const cleaned = arr.map((v) => (opts.includes(v) ? v : v.slice(0, 200)));
        pushCustom(field, cleaned, identity, customAnswers, fieldErrors);
      } else {
        const v = String(raw).trim();
        if (opts.includes(v)) {
          pushCustom(field, v, identity, customAnswers, fieldErrors);
        } else if (allowOther) {
          pushCustom(field, v.slice(0, 200), identity, customAnswers, fieldErrors);
        } else {
          fieldErrors[field.id] = "Invalid choice.";
        }
      }
      continue;
    }

    if (field.kind === "number") {
      const n = Number(String(raw).trim());
      if (!Number.isFinite(n)) { fieldErrors[field.id] = "Enter a number."; continue; }
      pushCustom(field, n, identity, customAnswers, fieldErrors);
      continue;
    }

    if (field.kind === "link") {
      const v = String(raw).trim();
      if (v.length > 2000 || !isSafeHttpUrl(v)) { fieldErrors[field.id] = "Enter a valid link (https)."; continue; }
      pushCustom(field, v, identity, customAnswers, fieldErrors);
      continue;
    }

    // text-like (short_text, paragraph, date) — identity rules apply when set
    const v = String(raw).trim();
    if (field.identity) {
      const err = applyIdentity(field.identity, v, identity);
      if (err) fieldErrors[field.id] = err;
    } else {
      customAnswers[field.id] = v.slice(0, 4000);
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, data: { identity, customAnswers } };
}

function pushCustom(
  field: FormField, value: string | number | string[],
  identity: ValidatedAnswers["identity"],
  custom: Record<string, AnswerValue>,
  fieldErrors: Record<string, string>,
) {
  if (field.identity === "department") {
    const dept = String(value).trim();
    const known = DEPARTMENTS.includes(dept as (typeof DEPARTMENTS)[number]);
    // A listed department is always fine; a free-text write-in is accepted only
    // when the field enables "Other" (so any university department can register).
    if (!dept || (!known && !field.allowOther)) {
      fieldErrors[field.id] = "Pick a department."; return;
    }
    identity.department = dept.slice(0, 80);
  } else if (field.identity === "year") {
    const y = Number(value);
    if (!Number.isInteger(y) || y < 1 || y > 5) { fieldErrors[field.id] = "Pick a valid year."; return; }
    identity.year = y;
  } else {
    custom[field.id] = value;
  }
}

function applyIdentity(
  identity: NonNullable<FormField["identity"]>, v: string, out: ValidatedAnswers["identity"],
): string | null {
  switch (identity) {
    case "name":
      if (v.length < 2 || v.length > 80 || !NAME_RE.test(v)) return "Use letters, spaces, . ' - only";
      out.student_name = v; return null;
    case "roll": {
      const up = v.toUpperCase();
      if (!ROLL_RE.test(up)) return "Enter a valid roll number";
      out.roll_no = up; return null;
    }
    case "email": {
      const lo = v.toLowerCase();
      if (lo.length > 120 || !EMAIL_RE.test(lo)) return "Enter a valid email";
      out.email = lo; return null;
    }
    case "phone":
      if (!PHONE_RE.test(v)) return "Enter a 10-digit mobile number";
      out.phone = v; return null;
    case "team_name":
      if (v.length < TEAM_NAME_MIN) return "Give your team a name";
      if (v.length > TEAM_NAME_MAX) return `Keep it under ${TEAM_NAME_MAX} characters`;
      out.team_name = v; return null;
    default:
      return null;
  }
}

/** Clean one member subfield by kind. "" = empty, null = invalid, else the value. */
function cleanMember(kind: MemberSubfield["kind"], raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  switch (kind) {
    case "email": { const lo = s.toLowerCase(); return lo.length <= 120 && EMAIL_RE.test(lo) ? lo : null; }
    case "roll": { const up = s.toUpperCase(); return ROLL_RE.test(up) ? up : null; }
    case "phone": return PHONE_RE.test(s) ? s : null;
    default: return s.slice(0, 200);
  }
}

/**
 * Validate a team block; on success writes the member array into `custom`.
 * Returns an error string or null.
 */
function validateTeam(
  field: FormField, raw: unknown, custom: Record<string, AnswerValue>,
): string | null {
  const subs = field.members ?? [];
  const min = field.minMembers ?? 1;
  const max = field.maxMembers ?? 10;
  const arr = Array.isArray(raw) ? raw : [];
  const kept: Record<string, string>[] = [];
  for (let idx = 0; idx < arr.length; idx++) {
    const src = (arr[idx] && typeof arr[idx] === "object" && !Array.isArray(arr[idx]))
      ? (arr[idx] as Record<string, unknown>) : {};
    const cleaned: Record<string, string> = {};
    let anyFilled = false;
    for (const sf of subs) {
      const res = cleanMember(sf.kind, src[sf.key]);
      if (res === null) return `Member ${idx + 1}: check ${sf.label}.`;
      if (res) { anyFilled = true; cleaned[sf.key] = res; }
    }
    if (!anyFilled) continue; // drop fully-empty member
    for (const sf of subs) {
      if (sf.required && !cleaned[sf.key]) return `Member ${idx + 1}: ${sf.label} is required.`;
    }
    kept.push(cleaned);
  }
  if (kept.length > max) return `Add at most ${max} members.`;
  if (field.required && kept.length < min) return `Add at least ${min} member${min > 1 ? "s" : ""}.`;
  if (kept.length > 0) custom[field.id] = kept;
  return null;
}
