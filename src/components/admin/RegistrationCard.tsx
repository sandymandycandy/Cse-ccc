"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { teamMark, presentPositions } from "@/lib/admin/team-attendance";
import type { BoardEntry } from "./RegistrationsBoard";

const BADGE = {
  unmarked: ["Not marked", "abadge"],
  present: ["Present", "abadge abadge-approved"],
  partial: ["Partly present", "abadge abadge-pending"],
} as const;

/**
 * One registration in full: every person on the team with a Present / Absent
 * choice, then the rest of their answers. Present is the default — this card is
 * for the exceptions. On an unmarked team neither choice is pressed; pressing
 * either marks the team attended (see setPerson).
 */
export function RegistrationCard({ entry, canEdit, onClose, onMark, pending, error }: {
  entry: BoardEntry;
  canEdit: boolean;
  onClose: () => void;
  onMark: (position: number, present: boolean) => void;
  pending: boolean;
  error: string;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  // The board hands a fresh onClose every render; keep the latest in a ref so
  // focus moves to Close once, on open, and not after every mark.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const size = entry.people.length;
  const mark = teamMark(size, entry.attended, entry.absent);
  const present = new Set(presentPositions(size, entry.attended, entry.absent));
  const [badgeText, badgeClass] = BADGE[mark];
  const writable = canEdit && entry.eligible;

  return (
    <>
      <div className="regcard-backdrop" onClick={onClose} aria-hidden />
      <section className="regcard" role="dialog" aria-modal="true" aria-labelledby={`regcard-${entry.id}`}>
        <header className="regcard-head">
          <div>
            <h2 id={`regcard-${entry.id}`}>{entry.title}</h2>
            {entry.leader ? <p className="hint">Led by {entry.leader}</p> : null}
          </div>
          <span className={badgeClass}>{badgeText}</span>
          <button ref={closeRef} type="button" className="regcard-close" aria-label="Close" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="regcard-body">
          <h3 className="label">People</h3>
          {mark === "unmarked" && writable ? (
            <p className="hint">Not marked yet. Marking anyone counts the rest of the team as present.</p>
          ) : null}
          <ul className="regcard-people">
            {entry.people.map((p) => {
              const on = present.has(p.position);
              const who = p.name || p.roll;
              return (
                <li key={p.position}>
                  <div className="regcard-person">
                    <strong>{who}</strong>
                    {p.role ? <span className="label">{p.role}</span> : null}
                    <span className="hint">{[p.roll, p.deptYear, p.email, p.phone].filter(Boolean).join(" · ")}</span>
                  </div>
                  <div className="regcard-toggle" role="group" aria-label={`${who} attendance`}>
                    {([true, false] as const).map((value) => (
                      <button
                        key={String(value)}
                        type="button"
                        aria-label={`${who} ${value ? "present" : "absent"}`}
                        aria-pressed={mark !== "unmarked" && on === value}
                        data-kind={value ? "present" : "absent"}
                        disabled={!writable || pending}
                        onClick={() => onMark(p.position, value)}
                      >
                        {value ? "Present" : "Absent"}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
          {error ? <p role="alert" className="regcard-error">{error}</p> : null}

          {entry.answers.length > 0 ? (
            <>
              <h3 className="label">Answers</h3>
              <dl className="regcard-answers">
                {entry.answers.map((a) => (
                  <div key={a.label}>
                    <dt>{a.label}</dt>
                    <dd>
                      {a.href ? (
                        <a href={a.href} target="_blank" rel="noopener noreferrer">link ↗</a>
                      ) : (
                        a.value || "—"
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}
        </div>
      </section>
    </>
  );
}
