"use client";

import { useRef, useState } from "react";
import { Activity, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import type { AuditEntry } from "@/lib/admin/queries";
import { istDateMedium, istNumericDate, istTime } from "@/lib/datetime";
import { matchesAny } from "@/lib/admin/roster-filter";

const PAGE_SIZE = 20;
export const auditLabel = (value: string) => value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export function filterAuditEntries(entries: AuditEntry[], query: string, action: string, entity: string) {
  return entries.filter((entry) => (!action || entry.action === action) && (!entity || entry.entity === entity) && matchesAny([
    entry.id, entry.actor ?? "System", entry.action, auditLabel(entry.action), entry.entity,
    auditLabel(entry.entity), entry.entityId, entry.summary, entry.ip,
    istNumericDate(entry.at), istDateMedium(entry.at), istTime(entry.at),
  ], query));
}

export function AuditLog({ entries }: { entries: AuditEntry[] }) {
  const [query, setQuery] = useState("");
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [page, setPage] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const actions = [...new Set(entries.map((e) => e.action))].sort();
  const entities = [...new Set(entries.map((e) => e.entity))].sort();
  const filtered = filterAuditEntries(entries, query, action, entity);
  const lastPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const hasFilters = !!(query.trim() || action || entity);
  const reset = () => { setQuery(""); setAction(""); setEntity(""); setPage(0); searchRef.current?.focus(); };
  const turnPage = (next: number) => {
    setPage(next);
    listRef.current?.focus({ preventScroll: true });
    listRef.current?.scrollIntoView({ behavior: "instant", block: "start" });
  };

  return <>
    <div className="listbar audit-toolbar">
      <div className="listbar-row">
        <div className="listbar-search">
          <span aria-hidden="true"><Search size={17} /></span>
          <input ref={searchRef} type="search" aria-label="Search audit activity" placeholder="Search people, records or details…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} />
          {query ? <button type="button" className="listbar-clear" aria-label="Clear audit search" onClick={() => { setQuery(""); setPage(0); searchRef.current?.focus(); }}><X size={16} aria-hidden="true" /></button> : null}
        </div>
        <select aria-label="Filter by action" value={action} onChange={(e) => { setAction(e.target.value); setPage(0); }}>
          <option value="">All actions</option>
          {actions.map((a) => <option key={a} value={a}>{auditLabel(a)}</option>)}
        </select>
        <select aria-label="Filter by area" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(0); }}>
          <option value="">All areas</option>
          {entities.map((a) => <option key={a} value={a}>{auditLabel(a)}</option>)}
        </select>
      </div>
      <div className="listbar-meta">
        <p className="count-note" aria-live="polite">{hasFilters ? `${filtered.length} of ${entries.length}` : entries.length} {entries.length === 1 ? "entry" : "entries"}</p>
        {hasFilters ? <button type="button" className="listbar-reset" onClick={reset}>Reset filters <X size={13} aria-hidden="true" /></button> : null}
        <span className="audit-order">Newest first · Times in IST</span>
      </div>
    </div>
    {visible.length ? <div className="audit-feed" ref={listRef} tabIndex={-1} aria-label="Audit activity">
      <ol className="audit-list">
        {visible.map((entry) => <li key={entry.id} className="audit-entry">
          <span className="audit-activity-icon" aria-hidden="true"><Activity size={17} /></span>
          <div className="audit-entry-content">
            <div className="audit-entry-heading"><strong>{entry.actor ?? "System"}</strong><span className="audit-action">{auditLabel(entry.action)}</span></div>
            <p className="audit-entity">{auditLabel(entry.entity)}{entry.entityId ? <span> · {entry.entityId.slice(0, 8)}</span> : null}</p>
            {entry.summary ? <p className="audit-summary">{entry.summary}</p> : null}
            <details className="audit-details">
              <summary>Record details <ChevronRight size={13} aria-hidden="true" /></summary>
              <dl>
                <div><dt>Recorded summary</dt><dd>{entry.summary || "No change summary recorded."}</dd></div>
                <div><dt>Record ID</dt><dd>{entry.entityId ?? "Not recorded"}</dd></div>
                <div><dt>IP address</dt><dd>{entry.ip ?? "Not recorded"}</dd></div>
                <div><dt>Audit ID</dt><dd>{entry.id}</dd></div>
              </dl>
            </details>
          </div>
          <time className="audit-time" dateTime={entry.at}><span>{istDateMedium(entry.at)}</span><span>{istTime(entry.at)}</span></time>
        </li>)}
      </ol>
      <div className="audit-pagination">
        <p className="count-note" aria-live="polite">Showing {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</p>
        <div><button type="button" className="btn btn-sm btn-ghost" disabled={currentPage === 0} onClick={() => turnPage(currentPage - 1)}><ChevronLeft size={15} aria-hidden="true" />Previous</button><button type="button" className="btn btn-sm btn-ghost" disabled={currentPage === lastPage} onClick={() => turnPage(currentPage + 1)}>Next<ChevronRight size={15} aria-hidden="true" /></button></div>
      </div>
    </div> : <div className="table-empty"><span className="table-empty-icon"><Activity size={24} aria-hidden="true" /></span><h2>{entries.length ? "No matching activity" : "No activity recorded yet"}</h2><p>{entries.length ? "Try a different search or clear the filters." : "Admin changes will appear here as they happen."}</p>{hasFilters ? <button type="button" className="btn btn-ghost" onClick={reset}>Clear filters</button> : null}</div>}
  </>;
}
