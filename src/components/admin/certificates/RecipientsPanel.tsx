"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  reissueCertificateAction,
  revokeCertificateAction,
} from "@/app/admin/(app)/events/[id]/certificates/actions";
import { istDateMedium } from "@/lib/datetime";
import { buildCertificateZip, saveBlob, type ZipProgress } from "./zip";

/**
 * The Recipients tab (spec §3.2): everyone across every group, what state their
 * certificate is in, what would look wrong on it, and the per-person actions —
 * preview, download, re-issue and (for those who may) revoke.
 */

export interface RecipientRow {
  key: string;
  groupId: string;
  groupName: string;
  kind: "registration" | "member" | "sheet";
  name: string;
  /** Roll / VTU number, when their record has one — searchable. */
  roll: string;
  teamLabel: string | null;
  email: string | null;
  /** Where their certificate is actually emailed: their own address, or their leader's. */
  deliverTo: string | null;
  viaLeader: boolean;
  warnings: string[];
  status:
    | { state: "pending" }
    | { state: "issued"; certificateId: string; serial: string; issuedAt: string }
    | { state: "revoked"; revokedAt: string };
  filename: string;
}

interface Props {
  eventId: string;
  rows: RecipientRow[];
  groups: { id: string; name: string }[];
  canRevoke: boolean;
}

type StatusFilter = "all" | "pending" | "issued" | "revoked" | "warnings";

const KIND_LABEL: Record<RecipientRow["kind"], string> = {
  registration: "",
  member: "team member",
  sheet: "",
};

export function RecipientsPanel({ eventId, rows, groups, canRevoke }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<RecipientRow | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [zipProgress, setZipProgress] = useState<ZipProgress | null>(null);
  const stopZip = useRef(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (groupFilter !== "all" && row.groupId !== groupFilter) return false;
      if (statusFilter === "warnings" ? row.warnings.length === 0 : statusFilter !== "all" && row.status.state !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return [row.name, row.roll, row.email ?? "", row.teamLabel ?? "", row.groupName, row.status.state === "issued" ? row.status.serial : ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [rows, query, groupFilter, statusFilter]);

  const issuedVisible = visible.filter((r) => r.status.state === "issued");

  async function reissue(row: RecipientRow) {
    setBusyKey(row.key);
    setMessage(null);
    const res = await reissueCertificateAction({ eventId, recipientKey: row.key });
    setBusyKey(null);
    if (!res.ok) {
      setMessage({ tone: "error", text: res.error });
      return;
    }
    const what = res.superseded ? "Re-issued" : "Issued";
    setMessage({
      tone: "ok",
      text: res.emailed
        ? `${what} ${row.name} as ${res.serial} and emailed it.`
        : `${what} ${row.name} as ${res.serial}. No address on file, so download it from this row.`,
    });
    router.refresh();
  }

  async function revoke() {
    const row = revoking;
    if (!row || row.status.state !== "issued") return;
    setBusyKey(row.key);
    const res = await revokeCertificateAction({ eventId, certificateId: row.status.certificateId, reason });
    setBusyKey(null);
    if (!res.ok) {
      setMessage({ tone: "error", text: res.error });
      return;
    }
    setRevoking(null);
    setReason("");
    setMessage({ tone: "ok", text: `Revoked ${row.name}'s certificate.` });
    router.refresh();
  }

  async function downloadZip() {
    stopZip.current = false;
    setMessage(null);
    setZipProgress({ done: 0, total: issuedVisible.length, failed: 0 });
    const result = await buildCertificateZip(
      issuedVisible.map((r) => ({
        certificateId: r.status.state === "issued" ? r.status.certificateId : "",
        filename: r.filename,
      })),
      setZipProgress,
      () => stopZip.current,
    );
    setZipProgress(null);
    if ("error" in result) {
      setMessage({ tone: "error", text: result.error });
      return;
    }
    saveBlob(result.blob, "certificates.zip");
    if (result.failed > 0) {
      setMessage({ tone: "error", text: `${result.failed} certificate(s) could not be added to the ZIP.` });
    }
  }

  return (
    <section style={{ marginTop: 18 }}>
      <div className="cd-filters">
        <input
          type="search"
          value={query}
          placeholder="Search name, roll, email, team or serial"
          aria-label="Search recipients"
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="cd-inline">
          Group
          <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
            <option value="all">All</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="cd-inline">
          Status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
            <option value="all">All</option>
            <option value="pending">Not issued</option>
            <option value="issued">Issued</option>
            <option value="revoked">Revoked</option>
            <option value="warnings">Needs a look</option>
          </select>
        </label>
        <span className="hint">
          {visible.length} of {rows.length}
        </span>
      </div>

      <div className="stack" style={{ marginTop: 10 }}>
        <button type="button" className="btn btn-ghost btn-sm" disabled={issuedVisible.length === 0 || !!zipProgress} onClick={downloadZip}>
          {zipProgress ? `Zipping ${zipProgress.done}/${zipProgress.total}…` : `Download ${issuedVisible.length} as ZIP`}
        </button>
        {zipProgress ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => (stopZip.current = true)}>
            Stop
          </button>
        ) : null}
        <a
          className="btn btn-ghost btn-sm"
          href={`/api/admin/events/${eventId}/certificates/print${groupFilter === "all" ? "" : `?group=${groupFilter}`}`}
        >
          Print booklet (PDF)
        </a>
      </div>

      {message ? (
        <p className="label" role="status" style={{ marginTop: 10, color: message.tone === "ok" ? "var(--forest)" : "var(--rust)" }}>
          {message.text}
        </p>
      ) : null}

      {revoking ? (
        <div className="cd-confirm" style={{ marginTop: 12 }}>
          <p className="body-text">
            Revoke <strong>{revoking.name}</strong>&rsquo;s certificate? It stops counting as issued. Say why — this is kept
            internally, never shown to the student.
          </p>
          <div className="field" style={{ maxWidth: 420 }}>
            <label htmlFor="revoke-reason">Reason</label>
            <input
              id="revoke-reason"
              value={reason}
              maxLength={200}
              placeholder="e.g. issued to the wrong person"
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className="stack">
            <button type="button" className="btn btn-accent btn-sm" disabled={!reason.trim() || busyKey !== null} onClick={revoke}>
              Revoke
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRevoking(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <div className="cal-empty" style={{ marginTop: 14 }}>
          {rows.length === 0
            ? "Nobody yet — mark people present on the registrations page, or upload a list in a group."
            : "No one matches that search."}
        </div>
      ) : (
        <div className="tablewrap cards" style={{ marginTop: 14 }}>
          <table className="admin">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Group</th>
                <th>Team</th>
                <th>Email</th>
                <th>Certificate</th>
                <th>Needs a look</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visible.map((row, i) => (
                <tr key={row.key}>
                  <td data-label="#" data-index="">{i + 1}</td>
                  <td data-primary="" style={{ fontWeight: 500 }}>
                    {row.name || "—"}
                    {KIND_LABEL[row.kind] ? <span className="hint"> · {KIND_LABEL[row.kind]}</span> : null}
                  </td>
                  <td data-label="Group">{row.groupName}</td>
                  <td data-label="Team">{row.teamLabel ?? "—"}</td>
                  <td data-label="Email">
                    {row.email ? (
                      row.email
                    ) : row.viaLeader ? (
                      <span className="hint">via team leader</span>
                    ) : (
                      <span style={{ color: "var(--rust)" }}>none</span>
                    )}
                  </td>
                  <td data-label="Certificate">
                    {row.status.state === "issued" ? (
                      <>
                        <span className="abadge abadge-approved">Issued</span>
                        <div className="cd-serial">
                          {row.status.serial}
                          <br />
                          {istDateMedium(row.status.issuedAt)}
                        </div>
                      </>
                    ) : row.status.state === "revoked" ? (
                      <span className="abadge abadge-rejected">Revoked</span>
                    ) : (
                      <span className="abadge abadge-pending">Not issued</span>
                    )}
                  </td>
                  <td data-label="Needs a look">
                    {row.warnings.length === 0 ? (
                      <span className="hint">—</span>
                    ) : (
                      <span style={{ color: "var(--clay)" }}>{row.warnings.join("; ")}</span>
                    )}
                  </td>
                  <td className="cd-actions-cell" data-action="">
                    <div className="stack">
                      {row.status.state === "issued" ? (
                        <>
                          <a className="btn btn-ghost btn-sm" href={`/api/admin/certificates/${row.status.certificateId}/pdf`}>
                            Download
                          </a>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={busyKey !== null}
                            onClick={() => reissue(row)}
                          >
                            {busyKey === row.key ? "Working…" : row.deliverTo ? "Re-issue & email" : "Re-issue"}
                          </button>
                          {canRevoke ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={busyKey !== null}
                              onClick={() => {
                                setRevoking(row);
                                setReason("");
                              }}
                            >
                              Revoke
                            </button>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <a
                            className="btn btn-ghost btn-sm"
                            href={`/api/admin/events/${eventId}/certificates/preview?group=${row.groupId}&recipient=${encodeURIComponent(row.key)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Preview
                          </a>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={busyKey !== null}
                            onClick={() => reissue(row)}
                          >
                            {busyKey === row.key
                              ? "Working…"
                              : row.status.state === "revoked"
                                ? "Issue again"
                                : row.deliverTo
                                  ? "Issue & email"
                                  : "Issue now"}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
