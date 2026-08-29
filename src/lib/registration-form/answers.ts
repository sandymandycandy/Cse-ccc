import { CHOICE_KINDS, type FormField } from "./schema";
import { isSafeHttpUrl } from "@/lib/url";
import { DEPARTMENTS } from "@/lib/departments";

export interface ValidatedAnswers {
  identity: {
    student_name?: string; roll_no?: string; email?: string;
    phone?: string; department?: string; year?: number;
  };
  customAnswers: Record<string, string | number | string[]>;
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
  const customAnswers: Record<string, string | number | string[]> = {};

  for (const field of schema) {
    const raw = values[field.id];
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
      if (field.kind === "checkboxes") {
        const arr = (Array.isArray(raw) ? raw : [raw]).map(String);
        if (arr.some((v) => !opts.includes(v))) { fieldErrors[field.id] = "Invalid choice."; continue; }
        pushCustom(field, arr, identity, customAnswers, fieldErrors);
      } else {
        const v = String(raw);
        if (!opts.includes(v)) { fieldErrors[field.id] = "Invalid choice."; continue; }
        pushCustom(field, v, identity, customAnswers, fieldErrors);
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
  custom: Record<string, string | number | string[]>,
  fieldErrors: Record<string, string>,
) {
  if (field.identity === "department") {
    if (!DEPARTMENTS.includes(value as (typeof DEPARTMENTS)[number])) {
      fieldErrors[field.id] = "Pick a department."; return;
    }
    identity.department = value as string;
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
    default:
      return null;
  }
}
