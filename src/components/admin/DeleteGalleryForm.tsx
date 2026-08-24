"use client";

import { deleteGalleryAction } from "@/app/admin/(app)/gallery/actions";

/** Confirm-guarded delete for a gallery photo. The action always redirects, so
 *  there's no error state to surface here. */
export function DeleteGalleryForm({ id }: { id: string }) {
  return (
    <form
      action={deleteGalleryAction}
      onSubmit={(e) => {
        if (!window.confirm("Delete this photo? This can't be undone.")) {
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
        Delete photo
      </button>
    </form>
  );
}
