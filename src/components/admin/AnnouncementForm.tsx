"use client";

import { useActionState } from "react";
import type { AnnouncementFormState } from "@/lib/admin/form-state";

type AnnouncementAction = (
  prev: AnnouncementFormState,
  formData: FormData,
) => Promise<AnnouncementFormState>;

const initial: AnnouncementFormState = {};

export interface AnnouncementInitial {
  title: string;
  body: string;
  published: boolean;
  imageUrl: string | null;
}

export function AnnouncementForm({
  action,
  submitLabel = "Create announcement",
  id,
  initial: init,
}: {
  action: AnnouncementAction;
  submitLabel?: string;
  id?: string;
  initial?: AnnouncementInitial;
}) {
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} encType="multipart/form-data" style={{ marginTop: 20, maxWidth: 640 }}>
      {id ? <input type="hidden" name="id" value={id} /> : null}

      {state.error ? (
        <div className="note" style={{ borderLeftColor: "var(--rust)", marginBottom: 16 }}>
          {state.error}
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="title">Title</label>
        <input id="title" name="title" required maxLength={140} defaultValue={init?.title} placeholder="e.g. Registrations open for TechFest 2026" />
      </div>

      <div className="field">
        <label htmlFor="body">Body</label>
        <textarea id="body" name="body" rows={12} required maxLength={20000} defaultValue={init?.body} placeholder="Write your announcement… (Markdown supported)" />
        <span className="hint">
          Formatting: <code># heading</code>, <code>**bold**</code>, <code>*italic*</code>,{" "}
          <code>`code`</code>, <code>[link](https://…)</code>, and <code>-</code> / <code>1.</code> lists.
        </span>
      </div>

      <div className="field">
        <label htmlFor="image">Cover image (optional)</label>
        {init?.imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={init.imageUrl}
              alt="Current cover"
              style={{ width: 160, height: 100, objectFit: "cover", borderRadius: 6, marginBottom: 8 }}
            />
            <span className="hint">Upload a new file to replace it.</span>
          </>
        ) : null}
        <input id="image" name="image" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
        <span className="hint">PNG, JPEG, WebP or GIF, up to 5 MB.</span>
      </div>

      <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <input type="checkbox" name="published" defaultChecked={init?.published} style={{ width: "auto" }} />
        <span>Published (visible to everyone)</span>
      </label>

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
