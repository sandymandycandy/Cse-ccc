"use client";

import { useState } from "react";
import { resetJoinTokenAction } from "@/app/admin/(app)/attendance/actions";

export function JoinLinkPanel({ clubId, url }: { clubId: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="note" style={{ display: "grid", gap: 8 }}>
      <div><strong>Self-registration link</strong> — share with your club; members fill their details and land as pending.</div>
      <code style={{ wordBreak: "break-all", fontSize: 12 }}>{url}</code>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn btn-sm"
          onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? "Copied!" : "Copy link"}
        </button>
        <form action={resetJoinTokenAction}>
          <input type="hidden" name="clubId" value={clubId} />
          <button className="btn btn-sm" style={{ color: "var(--rust)", borderColor: "var(--rust)" }}>Reset link</button>
        </form>
      </div>
    </div>
  );
}
