"use client";

import { useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { TeamProfileRow, type TeamProfileRowData } from "./TeamProfileRow";
import { matchesAny } from "@/lib/admin/roster-filter";
import type { TeamProfileState } from "@/lib/admin/form-state";

export function TeamDirectory({ rows, layers, saveAction, canEdit, children }: {
  rows: (TeamProfileRowData & { layer: string })[];
  layers: { id: string; title: string }[];
  saveAction: (prev: TeamProfileState, data: FormData) => Promise<TeamProfileState>;
  canEdit: boolean;
  children?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState("All");
  const visible = new Set(rows.filter((r) =>
    (view === "All" || (view === "Saved" ? r.hasRow : !r.hasRow)) &&
    matchesAny([r.name, r.role, r.placement, r.email], query),
  ).map((r) => r.memberId));
  const saved = rows.filter((r) => r.hasRow).length;
  const reset = () => { setQuery(""); setView("All"); };

  return <div className="team-directory">
    <div className="listbar">
      <div className="listbar-row">
        <div className="listbar-search">
          <span aria-hidden="true"><Search size={17} /></span>
          <input type="search" aria-label="Search people by name, role, team or email" placeholder="Search people…" value={query} onChange={(e) => setQuery(e.target.value)} />
          {query ? <button type="button" className="listbar-clear" aria-label="Clear people search" onClick={() => setQuery("")}><X size={16} aria-hidden="true" /></button> : null}
        </div>
        <div className="view-chips">{[{ name: "All", count: rows.length }, { name: "Saved", count: saved }, { name: "Unsaved", count: rows.length - saved }].map(({ name, count }) =>
          <button type="button" className="view-chip" key={name} aria-pressed={view === name} onClick={() => setView(name)}>{name}<span>{count}</span></button>,
        )}</div>
      </div>
      <div className="listbar-meta">
        <p className="count-note" aria-live="polite">{visible.size} of {rows.length} people</p>
        {query || view !== "All" ? <button type="button" className="listbar-reset" onClick={reset}>Reset filters <X size={13} aria-hidden="true" /></button> : null}
      </div>
    </div>
    {children}
    {visible.size === 0 ? <div className="table-empty"><h2>No matching people</h2><p>Try a different name, role or team.</p><button type="button" className="btn btn-ghost" onClick={reset}>Clear filters</button></div> : null}
    {layers.map((layer) => {
      const members = rows.filter((r) => r.layer === layer.id);
      if (!members.length) return null;
      const shown = members.filter((r) => visible.has(r.memberId)).length;
      return <section key={layer.id} className="team-directory-section" hidden={!shown}>
        <div className="sec-head"><h2>{layer.title}</h2><span className="label">{shown} of {members.length} shown</span></div>
        <div className="team-directory-rows">
          {/* Keep editors mounted so filtering never discards unsaved form input. */}
          {members.map((row) => <div key={row.memberId} hidden={!visible.has(row.memberId)}><TeamProfileRow row={row} saveAction={saveAction} canEdit={canEdit} /></div>)}
        </div>
      </section>;
    })}
  </div>;
}
