"use client";

import { useState } from "react";
import {
  addCertificateListRowAction,
  removeCertificateListRowAction,
  updateCertificateListRowAction,
} from "@/app/admin/(app)/events/[id]/certificates/actions";
import { validateListRow, type ListRow } from "@/lib/certificates/sheet";
import { SheetUpload } from "./SheetUpload";

type Draft = { name: string; email: string; roll: string };
const EMPTY: Draft = { name: "", email: "", roll: "" };

/**
 * The people in a list group — Volunteers, Judges — typed in one at a time
 * (spec 2026-09-15 §1.4), with the file upload alongside for long lists. Event
 * details fill in on their certificates like everyone else's.
 */
export function ListEditor({
  eventId,
  groupId,
  groupName,
  rows,
  winners,
  offline,
}: {
  eventId: string;
  groupId: string;
  groupName: string;
  rows: ListRow[];
  /** A Winners list: the upload also asks which column holds the placing. */
  winners?: boolean;
  offline?: boolean;
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<{ id: string; draft: Draft } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function run(work: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string, after: () => void) {
    if (offline) {
      setMessage({ tone: "error", text: "Saving only works on the real admin page." });
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await work();
    setBusy(false);
    if (!res.ok) {
      setMessage({ tone: "error", text: res.error });
      return;
    }
    after();
    setMessage({ tone: "ok", text: done });
  }

  function add() {
    const checked = validateListRow(draft);
    if (!checked.ok) {
      setMessage({ tone: "error", text: checked.error });
      return;
    }
    void run(() => addCertificateListRowAction({ eventId, groupId, ...draft }), `Added ${checked.row.name}.`, () =>
      setDraft(EMPTY),
    );
  }

  function saveEdit() {
    if (!editing) return;
    const checked = validateListRow(editing.draft);
    if (!checked.ok) {
      setMessage({ tone: "error", text: checked.error });
      return;
    }
    const { id, draft: next } = editing;
    void run(() => updateCertificateListRowAction({ eventId, groupId, rowId: id, ...next }), "Saved.", () => setEditing(null));
  }

  function remove(row: ListRow) {
    setConfirmRemove(null);
    void run(() => removeCertificateListRowAction({ eventId, groupId, rowId: row.id }), `Removed ${row.name}.`, () => {});
  }

  const field = (value: string, label: string, onChange: (v: string) => void, type = "text") => (
    <input
      type={type}
      value={value}
      aria-label={label}
      placeholder={label}
      maxLength={500}
      onChange={(e) => onChange(e.target.value)}
    />
  );

  return (
    <div className="cd-list">
      {rows.length > 0 ? (
        <div className="tablewrap cards">
          <table className="admin">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Email</th>
                <th>Roll no.</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) =>
                editing?.id === row.id ? (
                  <tr key={row.id}>
                    <td data-label="#" data-index="">
                      {i + 1}
                    </td>
                    <td data-label="Name">
                      {field(editing.draft.name, "Name", (name) => setEditing({ id: row.id, draft: { ...editing.draft, name } }))}
                    </td>
                    <td data-label="Email">
                      {field(
                        editing.draft.email,
                        "Email",
                        (email) => setEditing({ id: row.id, draft: { ...editing.draft, email } }),
                        "email",
                      )}
                    </td>
                    <td data-label="Roll no.">
                      {field(editing.draft.roll, "Roll no.", (roll) => setEditing({ id: row.id, draft: { ...editing.draft, roll } }))}
                    </td>
                    <td className="cd-actions-cell" data-action="">
                      <div className="stack">
                        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={saveEdit}>
                          {busy ? "Saving…" : "Save"}
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={row.id}>
                    <td data-label="#" data-index="">
                      {i + 1}
                    </td>
                    <td data-primary="" style={{ fontWeight: 500 }}>
                      {row.name}
                    </td>
                    <td data-label="Email">{row.email ?? "—"}</td>
                    <td data-label="Roll no.">{row.roll ?? "—"}</td>
                    <td className="cd-actions-cell" data-action="">
                      {confirmRemove === row.id ? (
                        <div className="stack">
                          <button type="button" className="btn btn-accent btn-sm" disabled={busy} onClick={() => remove(row)}>
                            Remove
                          </button>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmRemove(null)}>
                            Keep
                          </button>
                        </div>
                      ) : (
                        <div className="stack">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={busy}
                            onClick={() =>
                              setEditing({ id: row.id, draft: { name: row.name, email: row.email ?? "", roll: row.roll ?? "" } })
                            }
                          >
                            Edit
                          </button>
                          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setConfirmRemove(row.id)}>
                            Remove
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="hint">Nobody in {groupName} yet. Type people in below, or upload a list.</p>
      )}
      {confirmRemove ? <p className="hint">Certificates already issued to them stay valid.</p> : null}

      <form
        className="cd-list-add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        {field(draft.name, "Name", (name) => setDraft((d) => ({ ...d, name })))}
        {field(draft.email, "Email", (email) => setDraft((d) => ({ ...d, email })), "email")}
        {field(draft.roll, "Roll no.", (roll) => setDraft((d) => ({ ...d, roll })))}
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !draft.name.trim()}>
          + Add
        </button>
      </form>

      {message ? (
        <p className="label" role="status" style={{ color: message.tone === "ok" ? "var(--forest)" : "var(--rust)" }}>
          {message.text}
        </p>
      ) : null}

      {offline ? null : (
        <SheetUpload
          eventId={eventId}
          groupId={groupId}
          groupName={groupName}
          replaceCount={rows.length}
          winners={winners}
        />
      )}
    </div>
  );
}
