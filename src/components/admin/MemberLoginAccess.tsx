"use client";

import { useActionState } from "react";
import type { MemberInviteState } from "@/lib/admin/form-state";

type Action = (prev: MemberInviteState, formData: FormData) => Promise<MemberInviteState>;
const initial: MemberInviteState = {};

export function MemberLoginAccess({
  memberId, activated, generate, reset,
}: {
  memberId: string;
  activated: boolean;
  generate: Action;
  reset: Action;
}) {
  const [gen, genAction, genPending] = useActionState(generate, initial);
  const [res, resAction, resPending] = useActionState(reset, initial);
  const url = gen.inviteUrl ?? res.inviteUrl;
  const error = gen.error ?? res.error;

  return (
    <div>
      <p className="body-text" style={{ fontSize: 13, color: "var(--ink-2)", margin: "0 0 10px" }}>
        {activated
          ? "This member has set up their login. Use Reset access if they lost their device — we'll email them a fresh link."
          : "Generate a one-time link — we'll email it to the member, and you can also copy it below to share manually."}
      </p>
      {error ? <div className="note" style={{ borderLeftColor: "var(--rust)", marginBottom: 12 }}>{error}</div> : null}
      {url ? (
        <div className="note" style={{ marginBottom: 12 }}>
          <div className="label" style={{ marginBottom: 6 }}>Emailed to the member · copy to share manually</div>
          <code style={{ wordBreak: "break-all" }}>{url}</code>
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 10 }}>
        <form action={genAction}>
          <input type="hidden" name="memberId" value={memberId} />
          <button type="submit" className="btn" disabled={genPending}>
            {genPending ? "Generating…" : activated ? "New login link" : "Generate login link"}
          </button>
        </form>
        {activated ? (
          <form action={resAction}>
            <input type="hidden" name="memberId" value={memberId} />
            <button type="submit" className="btn" style={{ color: "var(--rust)" }} disabled={resPending}>
              {resPending ? "Resetting…" : "Reset access"}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
