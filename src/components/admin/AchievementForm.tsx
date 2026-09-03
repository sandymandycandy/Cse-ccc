"use client";

import { useActionState } from "react";
import type { AchievementFormState } from "@/lib/admin/form-state";
import { ImageEditor } from "./ImageEditor";

type AchievementAction = (
  prev: AchievementFormState,
  formData: FormData,
) => Promise<AchievementFormState>;

const initialState: AchievementFormState = {};

export interface AchievementInitial {
  title: string;
  description: string;
  happenedOn: string | null;
  clubId: string | null;
  imageUrl: string | null;
}

export function AchievementForm({
  action,
  submitLabel = "Add achievement",
  id,
  initial,
  clubs,
}: {
  action: AchievementAction;
  submitLabel?: string;
  id?: string;
  initial?: AchievementInitial;
  /** Clubs for the owner picker. Omit for club-scoped admins — their rows are
   *  pinned to their own club server-side, so no picker is shown. */
  clubs?: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

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
        <input id="title" name="title" required maxLength={140} defaultValue={initial?.title} placeholder="e.g. 1st place — Smart India Hackathon 2026" />
      </div>

      <div className="field">
        <label htmlFor="description">Description (optional)</label>
        <textarea
          id="description"
          name="description"
          rows={8}
          maxLength={20000}
          defaultValue={initial?.description}
          placeholder="Describe the achievement — Markdown supported"
        />
        <span className="hint">
          Formatting: <code># heading</code>, <code>**bold**</code>, <code>*italic*</code>,{" "}
          <code>`code`</code>, <code>[link](https://…)</code>, and <code>-</code> / <code>1.</code> lists.
        </span>
      </div>

      <div className="field">
        <label htmlFor="happenedOn">Date (optional)</label>
        <input
          id="happenedOn"
          name="happenedOn"
          type="date"
          defaultValue={initial?.happenedOn ?? ""}
          style={{ maxWidth: 200 }}
        />
      </div>

      {/* 3:2 to match the achievements list thumbnail. */}
      <ImageEditor
        label="Image (optional)"
        initialUrl={initial?.imageUrl ?? null}
        defaultAspect={3 / 2}
        hint="Crop and rotate before uploading. 3:2 matches how it is shown."
      />

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
