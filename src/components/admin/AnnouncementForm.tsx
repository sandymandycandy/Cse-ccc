"use client";

import { useActionState } from "react";
import type { AnnouncementFormState } from "@/lib/admin/form-state";
import { ImageEditor } from "./ImageEditor";
import { FieldError, fieldClass } from "@/components/admin/FieldError";

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
  /** Pre-formatted for a datetime-local input (IST wall-clock), "" for none. */
  expiresAtLocal: string;
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
    <form action={formAction} style={{ marginTop: 20, maxWidth: 640 }}>
      {id ? <input type="hidden" name="id" value={id} /> : null}

      {state.error ? (
        <div className="note" style={{ borderLeftColor: "var(--rust)", marginBottom: 16 }}>
          {state.error}
        </div>
      ) : null}

      <div className={fieldClass(state.fieldErrors, "title")}>
        <label htmlFor="title">Title</label>
        <input id="title" name="title" required maxLength={140} defaultValue={init?.title} placeholder="e.g. Registrations open for TechFest 2026" />
        <FieldError errors={state.fieldErrors} name="title" />
      </div>

      <div className={fieldClass(state.fieldErrors, "body")}>
        <label htmlFor="body">Body</label>
        <textarea id="body" name="body" rows={12} required maxLength={20000} defaultValue={init?.body} placeholder="Write your announcement… (Markdown supported)" />
        <span className="hint">
          Formatting: <code># heading</code>, <code>**bold**</code>, <code>*italic*</code>,{" "}
          <code>`code`</code>, <code>[link](https://…)</code>, and <code>-</code> / <code>1.</code> lists.
        </span>
        <FieldError errors={state.fieldErrors} name="body" />
      </div>

      {/* "Original" by default, like the gallery: neither the list thumbnail nor
          the detail page crops any more, so both show whatever shape is uploaded
          — a portrait poster included. Pre-cropping to 3:2 here used to throw
          away the top and bottom of exactly those posters before they were ever
          stored. Every preset is still one tap away for anyone who wants one. */}
      <ImageEditor
        label="Cover image (optional)"
        initialUrl={init?.imageUrl ?? null}
        defaultAspect={null}
        hint="Crop, rotate and resize before uploading — the announcement shows the shape you choose."
      />

      <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <input type="checkbox" name="published" defaultChecked={init?.published} style={{ width: "auto" }} />
        <span>Published (visible to everyone)</span>
      </label>

      <div className={fieldClass(state.fieldErrors, "expiresAt")}>
        <label htmlFor="expiresAt">Hide from the site after (IST, optional)</label>
        <input
          id="expiresAt"
          name="expiresAt"
          type="datetime-local"
          defaultValue={init?.expiresAtLocal}
        />
        <span className="hint">
          Leave blank and it stays up until a newer announcement replaces it in the
          hero. After this time it disappears from the home page and{" "}
          <code>/announcements</code> — it is <strong>not</strong> deleted, stays
          listed here, and anyone holding its link can still open it.
        </span>
        <FieldError errors={state.fieldErrors} name="expiresAt" />
      </div>

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
