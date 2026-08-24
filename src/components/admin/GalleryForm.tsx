"use client";

import { useActionState } from "react";
import type { GalleryFormState } from "@/lib/admin/form-state";

type GalleryAction = (
  prev: GalleryFormState,
  formData: FormData,
) => Promise<GalleryFormState>;

const initialState: GalleryFormState = {};

export interface GalleryInitial {
  caption: string;
  sort: number;
  clubId: string | null;
  imageUrl: string;
}

export function GalleryForm({
  action,
  submitLabel = "Add photo",
  id,
  initial,
  clubs,
}: {
  action: GalleryAction;
  submitLabel?: string;
  id?: string;
  initial?: GalleryInitial;
  /** Clubs for the owner picker. Omit for club-scoped admins — their photos are
   *  pinned to their own club server-side, so no picker is shown. */
  clubs?: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const editing = Boolean(id);

  return (
    <form action={formAction} encType="multipart/form-data" style={{ marginTop: 20, maxWidth: 560 }}>
      {id ? <input type="hidden" name="id" value={id} /> : null}

      {state.error ? (
        <div className="note" style={{ borderLeftColor: "var(--rust)", marginBottom: 16 }}>
          {state.error}
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="image">Photo{editing ? "" : " (required)"}</label>
        {initial?.imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={initial.imageUrl}
              alt="Current photo"
              style={{ width: 200, height: 130, objectFit: "cover", borderRadius: 6, marginBottom: 8 }}
            />
            <span className="hint">Upload a new file to replace it.</span>
          </>
        ) : null}
        <input
          id="image"
          name="image"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          required={!editing}
        />
        <span className="hint">PNG, JPEG, WebP or GIF, up to 5 MB.</span>
      </div>

      <div className="field">
        <label htmlFor="caption">Caption (optional)</label>
        <input id="caption" name="caption" maxLength={500} defaultValue={initial?.caption} />
      </div>

      <div className="field">
        <label htmlFor="sort">Sort order</label>
        <input
          id="sort"
          name="sort"
          type="number"
          min={0}
          max={9999}
          defaultValue={initial?.sort ?? 0}
          style={{ maxWidth: 120 }}
        />
        <span className="hint">Lower numbers show first.</span>
      </div>

      {clubs ? (
        <div className="field">
          <label htmlFor="clubId">Club</label>
          <select id="clubId" name="clubId" defaultValue={initial?.clubId ?? ""}>
            <option value="">Council-wide (all clubs)</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
