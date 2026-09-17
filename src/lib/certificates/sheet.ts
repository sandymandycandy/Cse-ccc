/**
 * Reading an uploaded recipient list (spec §3.3) — volunteers, judges, anyone
 * who is not in the event's registrations. Pure: the browser parses a CSV here
 * or hands XLSX rows in from `read-excel-file`, and the server re-runs the same
 * checks before writing, so a hand-made request can't get past the caps.
 */

export const SHEET_LIMITS = {
  rows: 1000,
  columns: 30,
  header: 80,
  cell: 500,
  /** The whole payload must stay under Next's 1 MB server-action body limit. */
  payloadBytes: 900 * 1024,
} as const;

/** One row as stored in `certificate_sheet_rows`. */
export interface SheetRow {
  row_no: number;
  name: string;
  email: string | null;
  /** Roll / VTU no. — typed in, or read from the upload's roll column. Prints as {Roll / VTU no.}. */
  roll: string | null;
  data: Record<string, string>;
}

/** A stored row with its id — what the typed list edits (spec 2026-09-15 §1.4). */
export interface ListRow extends SheetRow {
  id: string;
}

export interface ColumnChoice {
  name: number;
  email: number | null;
  roll: number | null;
  /** Winners from an uploaded list: which column holds the placing (spec §4.1). */
  position?: number | null;
}

export type SheetBuild =
  | { ok: true; columns: string[]; rows: SheetRow[]; dropped: number; invalidEmails: number }
  | { ok: false; error: string };

/** Whichever of , ; or tab appears most in the first line. */
function delimiterOf(firstLine: string): string {
  const counts = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length] as const);
  return counts.sort((a, b) => b[1] - a[1])[0][1] > 1 ? counts.sort((a, b) => b[1] - a[1])[0][0] : ",";
}

/**
 * RFC 4180 CSV: quoted fields may hold the delimiter, newlines and doubled
 * quotes. A BOM and CRLF line endings are handled; blank lines are dropped.
 */
export function parseDelimited(text: string): string[][] {
  const input = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (!input.trim()) return [];
  const delimiter = delimiterOf(input.split("\n", 1)[0] ?? "");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char !== '"') field += char;
      else if (input[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === delimiter) endField();
    else if (char === "\n") endRow();
    else field += char;
  }
  endRow();
  return rows;
}

const NAME_RE = /name|participant|student|person|recipient/i;
const NOT_A_PERSON_RE = /team|club|event|college|school|file/i;
const EMAIL_RE = /e-?mail/i;
const ROLL_RE = /roll|vtu|usn|reg(istration|ister)?\.?\s*(no|num)/i;

/** Guess which columns hold the person's name, address and roll no. */
export function detectColumns(header: string[]): ColumnChoice {
  const clean = header.map((h) => h.trim());
  const email = clean.findIndex((h) => EMAIL_RE.test(h));
  const roll = clean.findIndex((h, i) => i !== email && ROLL_RE.test(h));
  const name = clean.findIndex((h) => NAME_RE.test(h) && !NOT_A_PERSON_RE.test(h) && !ROLL_RE.test(h));
  const fallback = clean.findIndex((h, i) => i !== email && i !== roll && h !== "");
  return {
    name: name >= 0 ? name : fallback >= 0 ? fallback : 0,
    email: email >= 0 ? email : null,
    roll: roll >= 0 ? roll : null,
  };
}

/** Deliberately loose: this only decides whether we can email the row. */
const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(value);

/** Column headings, made non-empty and unique so every column is addressable as `{Sheet: …}`. */
function headingsOf(header: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  header.forEach((raw, i) => {
    const base = (raw ?? "").trim().slice(0, SHEET_LIMITS.header) || `Column ${i + 1}`;
    let name = base;
    for (let n = 2; seen.has(name); n++) name = `${base} ${n}`;
    seen.add(name);
    out.push(name);
  });
  return out;
}

/** Turn parsed cells into storable rows, applying every cap the DB and the action expect. */
export function buildSheetRows(table: string[][], choice: ColumnChoice): SheetBuild {
  if (table.length < 2) return { ok: false, error: "That sheet has a heading row but no people in it." };
  const [header, ...body] = table;
  if (header.length > SHEET_LIMITS.columns) {
    return { ok: false, error: `That sheet has more than ${SHEET_LIMITS.columns} columns.` };
  }
  if (body.length > SHEET_LIMITS.rows) {
    return { ok: false, error: `That sheet has more than ${SHEET_LIMITS.rows} rows. Split it and upload in parts.` };
  }

  const columns = headingsOf(header);
  const rows: SheetRow[] = [];
  let dropped = 0;
  let invalidEmails = 0;

  for (const raw of body) {
    const name = (raw[choice.name] ?? "").trim().slice(0, SHEET_LIMITS.cell);
    if (!name) {
      dropped++;
      continue;
    }
    const rawEmail = choice.email === null ? "" : (raw[choice.email] ?? "").trim();
    const email = looksLikeEmail(rawEmail) ? rawEmail.slice(0, SHEET_LIMITS.cell) : null;
    if (rawEmail && !email) invalidEmails++;
    const roll = choice.roll == null ? "" : (raw[choice.roll] ?? "").trim().slice(0, SHEET_LIMITS.cell);

    const data: Record<string, string> = {};
    columns.forEach((column, i) => {
      data[column] = (raw[i] ?? "").trim().slice(0, SHEET_LIMITS.cell);
    });
    rows.push({ row_no: rows.length + 1, name, email, roll: roll || null, data });
  }

  if (rows.length === 0) return { ok: false, error: "No rows with a name — check which column holds the name." };
  const payload = JSON.stringify(rows).length;
  if (payload > SHEET_LIMITS.payloadBytes) {
    return { ok: false, error: "That sheet is too large. Remove columns you don't need, or split it." };
  }
  return { ok: true, columns, rows, dropped, invalidEmails };
}

export type ListRowCheck =
  | { ok: true; row: { name: string; email: string | null; roll: string | null } }
  | { ok: false; error: string };

/**
 * One person typed into a list (spec 2026-09-15 §1.4). Stricter than an upload:
 * a typo'd email is refused, not silently dropped, because the person typing can
 * fix it. The browser and the server action both run this.
 */
export function validateListRow(input: { name?: unknown; email?: unknown; roll?: unknown }): ListRowCheck {
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const name = text(input.name);
  const email = text(input.email);
  const roll = text(input.roll);
  if (!name) return { ok: false, error: "Enter a name." };
  if (name.length > SHEET_LIMITS.cell) return { ok: false, error: "That name is too long." };
  if (email && !looksLikeEmail(email)) return { ok: false, error: "That email doesn't look right." };
  if (email.length > SHEET_LIMITS.cell) return { ok: false, error: "That email is too long." };
  if (roll.length > SHEET_LIMITS.cell) return { ok: false, error: "That roll no. is too long." };
  return { ok: true, row: { name, email: email || null, roll: roll || null } };
}
