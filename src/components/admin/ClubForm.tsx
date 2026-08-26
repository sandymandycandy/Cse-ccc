"use client";

import { useActionState } from "react";
import type { ClubFormState } from "@/lib/admin/form-state";

type ClubAction = (prev: ClubFormState, formData: FormData) => Promise<ClubFormState>;

const initialState: ClubFormState = {};

export interface ClubInitial {
  name: string;
  tagline: string | null;
  description: string | null;
}

export function ClubForm({
  action,
  id,
  initial,
}: {
  action: ClubAction;
  id: string;
  initial: ClubInitial;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} style={{ marginTop: 20, maxWidth: 560 }}>
      <input type="hidden" name="id" value={id} />

      {state.error ? (
        <div className="note" style={{ borderLeftColor: "var(--rust)", marginBottom: 16 }}>
          {state.error}
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" required minLength={2} maxLength={80} defaultValue={initial.name} placeholder="Club name" />
      </div>

      <div className="field">
        <label htmlFor="tagline">Tagline</label>
        <input
          id="tagline"
          name="tagline"
          maxLength={160}
          placeholder="One line — what the club is about"
          defaultValue={initial.tagline ?? ""}
        />
        <span className="hint">Optional. Shown under the club name.</span>
      </div>

      <div className="field">
        <label htmlFor="description">Description</label>
        <textarea
          id="description"
          name="description"
          rows={6}
          maxLength={2000}
          placeholder="A paragraph or two about the club, its focus and what members do."
          defaultValue={initial.description ?? ""}
        />
        <span className="hint">Optional. Appears on the club&rsquo;s public page.</span>
      </div>

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
