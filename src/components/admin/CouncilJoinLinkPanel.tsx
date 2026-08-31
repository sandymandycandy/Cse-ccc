"use client";

import { useState } from "react";
import { rotateJoinTokenAction } from "@/app/admin/(app)/council/actions";

export function CouncilJoinLinkPanel({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="note" style={{ display: "grid", gap: 8 }}>
      <div><strong>Council self-registration link</strong> — share with the council; members fill their details and land as pending.</div>
      <code style={{ wordBreak: "break-all", fontSize: 12 }}>{url}</code>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn btn-sm"
          onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? "Copied!" : "Copy link"}
        </button>
        <form action={rotateJoinTokenAction}>
          <button className="btn btn-sm" style={{ color: "var(--rust)", borderColor: "var(--rust)" }}>Reset link</button>
        </form>
      </div>
    </div>
  );
}
