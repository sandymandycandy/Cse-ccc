"use client";

import { useState, useTransition } from "react";
import { previewAudienceAction } from "@/app/admin/(app)/email/actions";

export interface PickerRecipient {
  email: string;
  name: string | null;
}

/** The audience as the form describes it. Re-authorised on the server. */
export interface PickerAudience {
  kind: string;
  clubId?: string;
  eventId?: string;
  scope?: string;
  emails?: string;
}

/** Case-insensitive match on either the name or the address. */
export function filterRecipients(list: PickerRecipient[], query: string): PickerRecipient[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (r) => r.email.toLowerCase().includes(q) || (r.name ?? "").toLowerCase().includes(q),
  );
}

/**
 * Who this audience contains, and who to leave out.
 *
 * ⚠️ Posts the people who were UNTICKED, in a hidden `exclude` field — never
 * the ones who were kept. The server resolves the audience itself and only
 * ever subtracts, so a tampered form can shrink a send but can never inject an
 * address. See `applyExclusions` for the full reasoning.
 *
 * Exclusions are per-send by design: this component is keyed on the audience
 * in the composer, so switching audience (or sending) remounts it and everyone
 * is ticked again. Someone who quietly stays unticked across sends is a mail
 * that silently never reaches them.
 */
export function RecipientPicker({
  audience,
  onSelectedChange,
}: {
  audience: PickerAudience;
  /** Effective recipient count, so the send button can show it. null = unknown. */
  onSelectedChange?: (n: number | null) => void;
}) {
  const [recipients, setRecipients] = useState<PickerRecipient[] | null>(null);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const drop = new Set(excluded);
  const selected = recipients ? recipients.filter((r) => !drop.has(r.email)).length : null;

  const setExclusions = (next: string[]) => {
    setExcluded(next);
    if (recipients) {
      const s = new Set(next);
      onSelectedChange?.(recipients.filter((r) => !s.has(r.email)).length);
    }
  };

  const load = () => {
    if (recipients) {
      setOpen((o) => !o);
      return;
    }
    start(async () => {
      const r = await previewAudienceAction(audience);
      if (r.error || !r.recipients) {
        setError(r.error ?? "Could not read that audience.");
        return;
      }
      setError(null);
      setRecipients(r.recipients);
      setOpen(true);
      onSelectedChange?.(r.recipients.length);
    });
  };

  const shown = recipients ? filterRecipients(recipients, query) : [];

  return (
    <div className="rpick">
      {/* Always present, so a send with nothing unticked still posts a field
          rather than the browser omitting it entirely. */}
      <input type="hidden" name="exclude" value={excluded.join(",")} />

      <button type="button" className="btn btn-ghost btn-sm" onClick={load} disabled={pending}>
        {pending
          ? "Reading…"
          : !recipients
            ? "See who gets it"
            : open
              ? "Hide the list"
              : `Show the list — ${selected} of ${recipients.length}`}
      </button>

      {error ? (
        <p className="hint rpick-err" role="alert">
          {error}
        </p>
      ) : null}

      {recipients && open ? (
        <div className="rpick-panel">
          <div className="rpick-head">
            <input
              type="search"
              className="rpick-search"
              placeholder="Find a name or address"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Filter recipients"
            />
            <span className="hint rpick-count">
              {selected} of {recipients.length} selected
            </span>
          </div>

          <div className="rpick-acts">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setExclusions([])}
              disabled={excluded.length === 0}
            >
              Select all
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setExclusions(recipients.map((r) => r.email))}
              disabled={selected === 0}
            >
              Select none
            </button>
          </div>

          {shown.length === 0 ? (
            <p className="hint rpick-empty">Nobody matches “{query}”.</p>
          ) : (
            <ul className="rpick-list">
              {shown.map((r) => (
                <li key={r.email}>
                  <label className="rpick-row">
                    <input
                      type="checkbox"
                      checked={!drop.has(r.email)}
                      onChange={(e) =>
                        setExclusions(
                          e.target.checked
                            ? excluded.filter((x) => x !== r.email)
                            : [...excluded, r.email],
                        )
                      }
                    />
                    <span className="rpick-who">
                      <span className="rpick-name">{r.name ?? "—"}</span>
                      <span className="rpick-mail">{r.email}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
