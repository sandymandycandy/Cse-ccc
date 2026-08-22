// Injection-safe CSV (SECURITY_SPEC §12). A cell starting with = + - @ tab or CR
// can execute as a formula in Excel/Sheets, so it's prefixed with a single quote
// and the whole field quoted; quotes/newlines are escaped (RFC 4180); the output
// carries a UTF-8 BOM so Excel reads non-ASCII (e.g. Indian names) correctly.

const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: unknown): string {
  let s = value == null ? "" : String(value);
  const dangerous = FORMULA_START.test(s);
  if (dangerous) s = "'" + s;
  if (dangerous || /[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

const BOM = "﻿";

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(cell).join(",")];
  for (const row of rows) lines.push(row.map(cell).join(","));
  return BOM + lines.join("\r\n");
}
