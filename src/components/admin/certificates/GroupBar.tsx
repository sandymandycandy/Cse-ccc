"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createCertificateGroupAction,
  deleteCertificateGroupAction,
  renameCertificateGroupAction,
} from "@/app/admin/(app)/events/[id]/certificates/actions";
import type { BaseKind } from "@/lib/certificates/bases";
import type { ListRow } from "@/lib/certificates/sheet";
import { ListEditor } from "./ListEditor";

/**
 * The groups an event issues certificates for (spec D6): Participants, plus any
 * uploaded list — volunteers, judges — each with its own design and wording.
 */

export interface GroupSummary {
  id: string;
  name: string;
  kind: "participants" | "sheet" | "results";
  people: number;
  /** The council base slot this group fills; null for an extra group. */
  baseKind: BaseKind | null;
  followsBase: boolean;
}

export function GroupBar({
  eventId,
  groups,
  activeId,
  tab,
  listRows,
}: {
  eventId: string;
  groups: GroupSummary[];
  activeId: string;
  tab: string;
  /** The active group's people, when it is a list group. */
  listRows: ListRow[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = groups.find((g) => g.id === activeId);
  const go = (groupId: string) => router.push(`/admin/events/${eventId}/certificates?tab=${tab}&group=${groupId}`);

  async function add() {
    setBusy(true);
    setError(null);
    const res = await createCertificateGroupAction({ eventId, name });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setAdding(false);
    setName("");
    go(res.groupId);
  }

  async function rename() {
    setBusy(true);
    setError(null);
    const res = await renameCertificateGroupAction({ eventId, groupId: activeId, name });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setRenaming(false);
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await deleteCertificateGroupAction({ eventId, groupId: activeId });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setConfirmDelete(false);
    go(groups.find((g) => g.baseKind === "participants")?.id ?? groups[0].id);
  }

  return (
    <div className="cd-groups">
      <div className="stack">
        <span className="label">Group</span>
        {groups.map((group) => (
          <button
            key={group.id}
            type="button"
            className="chip"
            aria-pressed={group.id === activeId}
            onClick={() => go(group.id)}
          >
            {group.name} · {group.people}{" "}
            <span className="cd-badge">{group.followsBase ? "● Base" : "◆ Custom"}</span>
          </button>
        ))}
        {adding ? null : (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setAdding(true); setName(""); }}>
            + Group
          </button>
        )}
        {active && active.baseKind === null && !renaming ? (
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setRenaming(true); setName(active.name); }}>
              Rename
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(true)}>
              Delete group
            </button>
          </>
        ) : null}
      </div>

      {adding || renaming ? (
        <div className="stack" style={{ marginTop: 8 }}>
          <input
            value={name}
            maxLength={60}
            autoFocus
            placeholder="Volunteers"
            aria-label={adding ? "New group name" : "New name for this group"}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) void (adding ? add() : rename());
              if (e.key === "Escape") {
                setAdding(false);
                setRenaming(false);
              }
            }}
          />
          <button type="button" className="btn btn-primary btn-sm" disabled={busy || !name.trim()} onClick={() => (adding ? add() : rename())}>
            {busy ? "Saving…" : adding ? "Add group" : "Rename"}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setAdding(false); setRenaming(false); }}>
            Cancel
          </button>
        </div>
      ) : null}

      {confirmDelete && active ? (
        <div className="cd-confirm" style={{ marginTop: 8 }}>
          <p className="body-text">
            Delete <strong>{active.name}</strong> and its {active.people} {active.people === 1 ? "person" : "people"}?
            Certificates already issued to them stay valid and downloadable.
          </p>
          <div className="stack">
            <button type="button" className="btn btn-accent btn-sm" disabled={busy} onClick={remove}>
              Delete group
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {active?.kind === "sheet" ? (
        <ListEditor key={active.id} eventId={eventId} groupId={active.id} groupName={active.name} rows={listRows} />
      ) : null}

      {error ? (
        <p className="label" role="alert" style={{ color: "var(--rust)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
