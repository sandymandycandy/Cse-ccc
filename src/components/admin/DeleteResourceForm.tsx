"use client";

import { deleteResourceAction } from "@/app/admin/(app)/resources/actions";

/** Small confirm-guarded form for deleting a resource. The action always
 *  redirects, so there's no error state to surface here. */
export function DeleteResourceForm({ id }: { id: string }) {
  return (
    <form
      action={deleteResourceAction}
      onSubmit={(e) => {
        if (!window.confirm("Delete this resource? This can't be undone.")) {
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
        Delete resource
      </button>
    </form>
  );
}
