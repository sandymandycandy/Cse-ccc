"use client";

import { useActionState } from "react";
import { RESOURCE_KINDS, type ResourceKind } from "@/lib/resources";
import type { ResourceFormState } from "@/lib/admin/form-state";

type ResourceAction = (
  prev: ResourceFormState,
  formData: FormData,
) => Promise<ResourceFormState>;

const initialState: ResourceFormState = {};

export interface ResourceInitial {
  title: string;
  url: string;
  kind: ResourceKind;
  clubId: string | null;
}

export function ResourceForm({
  action,
  submitLabel = "Add resource",
  id,
  initial,
  clubs,
}: {
  action: ResourceAction;
  submitLabel?: string;
  id?: string;
  initial?: ResourceInitial;
  /** Clubs for the owner picker. Omit for club-scoped admins — their resources
   *  are pinned to their own club server-side, so no picker is shown. */
  clubs?: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} style={{ marginTop: 20, maxWidth: 560 }}>
      {id ? <input type="hidden" name="id" value={id} /> : null}

      {state.error ? (
        <div className="note" style={{ borderLeftColor: "var(--rust)", marginBottom: 16 }}>
          {state.error}
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="title">Title</label>
        <input id="title" name="title" required maxLength={140} defaultValue={initial?.title} />
      </div>

      <div className="field">
        <label htmlFor="url">Link</label>
        <input
          id="url"
          name="url"
          type="url"
          required
          maxLength={2000}
          placeholder="https://drive.google.com/…"
          defaultValue={initial?.url}
        />
        <span className="hint">Must start with http:// or https://</span>
      </div>

      <div className="field">
        <label htmlFor="kind">Type</label>
        <select id="kind" name="kind" defaultValue={initial?.kind ?? "drive"}>
          {RESOURCE_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
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
      ) : (
        // Club-scoped admin: club is fixed server-side; keep the field absent so
        // the submitted value can't widen scope.
        null
      )}

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
