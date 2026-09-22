"use client";

import { useEffect, useId, useRef, useState } from "react";
import { isGroupLink } from "@/lib/registration/whatsapp";

/**
 * The pop-up a student sees the moment their registration lands: one button
 * into the event's group chat.
 *
 * Shown rather than merely linked because joining the group is the one thing
 * left to do, and the moment they have just finished the form is the only
 * moment we have their attention. Dismissing it is not a dead end — the same
 * link stays on the success panel underneath (see `ResultMessage`).
 *
 * The link is re-validated here even though the server already did: this
 * component puts it straight into an `href`, and a `javascript:` value that
 * somehow reached the database must not become a link on a public page.
 */
export function WhatsAppInvite({ url, onClose }: { url: string | null; onClose: () => void }) {
  const titleId = useId();
  const joinRef = useRef<HTMLAnchorElement>(null);
  const [copied, setCopied] = useState(false);
  const safe = isGroupLink(url) ? url.trim() : null;

  // Escape closes, exactly as the admin image editor's dialog does.
  useEffect(() => {
    if (!safe) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [safe, onClose]);

  // Focus the join button so the keyboard lands inside the dialog, not behind it.
  useEffect(() => {
    if (safe) joinRef.current?.focus();
  }, [safe]);

  if (!safe) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(safe);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied, or an insecure context — the raw link is
      // printed below for exactly this case, so there is nothing to recover.
    }
  };

  return (
    <>
      <div className="wai-backdrop" onClick={onClose} aria-hidden />
      <div className="wai" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="wai-body">
          <div className="label">One last thing</div>
          <h3 id={titleId} className="wai-title">
            Join the event group
          </h3>
          <p className="body-text wai-lede">
            Everything about this event — timings, changes, reminders — goes to the WhatsApp group.
          </p>
          <a
            ref={joinRef}
            className="btn btn-primary wai-join"
            href={safe}
            target="_blank"
            rel="noopener noreferrer"
          >
            Join the WhatsApp group
          </a>
          <div className="wai-raw">
            <span className="wai-url">{safe}</span>
            <button type="button" className="btn btn-sm btn-ghost" onClick={copy}>
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          <button type="button" className="btn btn-ghost wai-later" onClick={onClose}>
            Maybe later
          </button>
        </div>
      </div>
    </>
  );
}
