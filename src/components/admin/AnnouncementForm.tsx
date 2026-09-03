"use client";

import { useActionState } from "react";
import type { AnnouncementFormState } from "@/lib/admin/form-state";
import { ImageEditor } from "./ImageEditor";

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

      {/* Defaults to 3:2 because that is the shape the announcements list
          thumbnail (120x80) and the detail hero both render — cropping to it
          here means the admin picks what shows, instead of a blind centre-crop. */}
      <ImageEditor
        label="Cover image (optional)"
        initialUrl={init?.imageUrl ?? null}
        defaultAspect={3 / 2}
        hint="Crop and rotate before uploading. 3:2 matches how covers are shown."
      />

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
