"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import type { RenameResult } from "./AdminTable";

export function SessionTitle({ id, title, onRename }: {
  id: string;
  title: string;
  onRename?: (id: string, title: string) => Promise<RenameResult>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  if (!editing || !onRename) return <div className="session-title">
    <strong>{title}</strong>
    {onRename ? <button type="button" className="session-rename" aria-label={`Rename ${title}`} onClick={() => { setValue(title); setError(""); setEditing(true); }}><Pencil size={14} aria-hidden="true" /></button> : null}
  </div>;

  return <form className="session-title-editor" onSubmit={async (e) => {
    e.preventDefault();
    if (pending || !value.trim()) return;
    setPending(true);
    setError("");
    try {
      const result = await onRename(id, value.trim());
      if (result.ok) setEditing(false);
      else setError(result.error ?? "Could not rename. Try again.");
    } catch { setError("Could not rename. Try again."); }
    finally { setPending(false); }
  }}>
    <input aria-label="Meeting title" value={value} onChange={(e) => setValue(e.target.value)} maxLength={140} required autoFocus disabled={pending} />
    <div className="session-title-buttons">
      <button className="btn btn-sm" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      <button type="button" className="btn btn-sm btn-ghost" disabled={pending} onClick={() => setEditing(false)}>Cancel</button>
    </div>
    {error ? <span role="alert">{error}</span> : null}
  </form>;
}
