"use client";

import { deleteAchievementAction } from "@/app/admin/(app)/achievements/actions";

/** Confirm-guarded delete for an achievement. The action always redirects, so
 *  there's no error state to surface here. */
export function DeleteAchievementForm({ id }: { id: string }) {
  return (
    <form
      action={deleteAchievementAction}
      onSubmit={(e) => {
        if (!window.confirm("Delete this achievement? This can't be undone.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="btn"
        style={{ color: "var(--rust)", borderColor: "var(--rust)" }}
      >
        Delete achievement
      </button>
    </form>
  );
}
