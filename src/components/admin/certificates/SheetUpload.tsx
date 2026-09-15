"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadCertificateSheetAction } from "@/app/admin/(app)/events/[id]/certificates/actions";
import { buildSheetRows, detectColumns, parseDelimited, SHEET_LIMITS, type ColumnChoice } from "@/lib/certificates/sheet";

/**
 * Upload the people in a group from a CSV or Excel file (spec §3.3). The file
 * is read in the browser — an .xlsx through `read-excel-file`, loaded only when
 * one is picked — and the columns are confirmed before anything is saved.
 */
export function SheetUpload({
  eventId,
  groupId,
  groupName,
  replaceCount,
}: {
  eventId: string;
  groupId: string;
  groupName: string;
  /** People already in the list — an upload replaces them. */
  replaceCount: number;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [table, setTable] = useState<string[][] | null>(null);
  const [choice, setChoice] = useState<ColumnChoice>({ name: 0, email: null, roll: null });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    setBusy(true);
    try {
      let rows: string[][];
      if (/\.xlsx?$/i.test(file.name)) {
        // Loaded only when an Excel file is actually picked — it is the heaviest
        // dependency on this page. `readSheet` gives the first sheet's rows.
        const { readSheet } = await import("read-excel-file/browser");
        const raw = await readSheet(file);
        rows = raw.map((row) => row.map((cell) => (cell == null ? "" : String(cell))));
      } else {
        rows = parseDelimited(await file.text());
      }
      if (rows.length < 2) {
        setMessage({ tone: "error", text: "That file has a heading row but no people in it." });
        return;
      }
      setTable(rows);
      setChoice(detectColumns(rows[0]));
    } catch {
      setMessage({ tone: "error", text: "Could not read that file. Save it as CSV or .xlsx and try again." });
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!table) return;
    setBusy(true);
    setMessage(null);
    const res = await uploadCertificateSheetAction({ eventId, groupId, table, choice });
    setBusy(false);
    if (!res.ok) {
      setMessage({ tone: "error", text: res.error });
      return;
    }
    const notes = [
      `${res.rows} ${res.rows === 1 ? "person" : "people"} in ${groupName}.`,
      res.dropped ? `${res.dropped} row${res.dropped === 1 ? "" : "s"} had no name and ${res.dropped === 1 ? "was" : "were"} skipped.` : "",
      res.invalidEmails ? `${res.invalidEmails} email${res.invalidEmails === 1 ? "" : "s"} didn't look valid — those get a download instead.` : "",
    ].filter(Boolean);
    setMessage({ tone: "ok", text: notes.join(" ") });
    setTable(null);
    router.refresh();
  }

  const preview = table ? table.slice(1, 6) : [];
  const headings = table?.[0] ?? [];
  const built = table ? buildSheetRows(table, choice) : null;

  return (
    <div className="cd-upload">
      <div className="stack">
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "Reading…" : "Upload a list"}
        </button>
        <span className="hint">
          CSV or Excel, up to {SHEET_LIMITS.rows} people. Uploading replaces the list; certificates already issued stay.
        </span>
      </div>
      <input
        ref={input}
        type="file"
        hidden
        accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(e) => {
          void onPick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {table ? (
        <div className="cd-confirm">
          <div className="cd-grid2">
            <label className="cd-row">
              <span>Name column</span>
              <select value={choice.name} onChange={(e) => setChoice((c) => ({ ...c, name: Number(e.target.value) }))}>
                {headings.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `Column ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="cd-row">
              <span>Email column</span>
              <select
                value={choice.email ?? ""}
                onChange={(e) => setChoice((c) => ({ ...c, email: e.target.value === "" ? null : Number(e.target.value) }))}
              >
                <option value="">None — download only</option>
                {headings.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `Column ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="cd-row">
              <span>Roll no. column</span>
              <select
                value={choice.roll ?? ""}
                onChange={(e) => setChoice((c) => ({ ...c, roll: e.target.value === "" ? null : Number(e.target.value) }))}
              >
                <option value="">None</option>
                {headings.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `Column ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="tablewrap" style={{ marginTop: 10 }}>
            <table className="admin">
              <thead>
                <tr>
                  {headings.map((h, i) => (
                    <th key={i}>
                      {h || `Column ${i + 1}`}
                      {i === choice.name ? " · name" : ""}
                      {i === choice.email ? " · email" : ""}
                      {i === choice.roll ? " · roll" : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i}>
                    {headings.map((_, c) => (
                      <td key={c}>{row[c] ?? ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="hint">
            {table.length - 1} row{table.length - 1 === 1 ? "" : "s"} in the file
            {built && !built.ok ? ` — ${built.error}` : built && built.ok ? `, ${built.rows.length} with a name.` : ""}
          </p>
          {replaceCount > 0 ? (
            <p className="note">
              This replaces the {replaceCount} {replaceCount === 1 ? "person" : "people"} already in {groupName}.
            </p>
          ) : null}
          <div className="stack">
            <button type="button" className="btn btn-primary btn-sm" disabled={busy || !built?.ok} onClick={save}>
              {busy ? "Saving…" : "Use this list"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTable(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p className="label" role="status" style={{ color: message.tone === "ok" ? "var(--forest)" : "var(--rust)" }}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
