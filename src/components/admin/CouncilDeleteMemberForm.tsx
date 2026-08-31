"use client";

import { deleteMemberAction } from "@/app/admin/(app)/council/actions";

export function CouncilDeleteMemberForm({ id }: { id: string }) {
  return (
    <form
      action={deleteMemberAction}
      onSubmit={(e) => {
        if (!window.confirm("Remove this council member? Their attendance history is deleted too. This can't be undone.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="btn" style={{ color: "var(--rust)", borderColor: "var(--rust)" }}>
        Remove member
      </button>
    </form>
  );
}
