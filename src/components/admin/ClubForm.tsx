"use client";

import { useActionState } from "react";
import {
  CLUB_CATEGORIES,
  CLUB_CATEGORY_LABELS,
  type ClubCategory,
} from "@/lib/validation/club";
import type { ClubFormState } from "@/lib/admin/form-state";

type ClubAction = (prev: ClubFormState, formData: FormData) => Promise<ClubFormState>;

const initialState: ClubFormState = {};

export interface ClubInitial {
  name: string;
  shortName: string;
  slug: string;
  category: ClubCategory;
  color: string;
  tagline: string | null;
  description: string | null;
  isActive: boolean;
  sort: number;
}

export function ClubForm({
  action,
  mode,
  canEditStructural,
  id,
  initial,
}: {
  action: ClubAction;
  mode: "create" | "edit";
  /** Show the slug / category / colour / active / sort fields (council-only). */
  canEditStructural: boolean;
  /** Present in edit mode. */
  id?: string;
  initial: ClubInitial;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const creating = mode === "create";

  return (
    <form action={formAction} style={{ marginTop: 20, maxWidth: 560 }}>
      {id ? <input type="hidden" name="id" value={id} /> : null}

      {state.error ? (
        <div className="note" style={{ borderLeftColor: "var(--rust)", marginBottom: 16 }}>
          {state.error}
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="name">Name</label>
        <input
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={80}
          defaultValue={initial.name}
          placeholder="Club name"
        />
      </div>

      <div className="field">
        <label htmlFor="shortName">Short name</label>
        <input
          id="shortName"
          name="shortName"
          required
          maxLength={40}
          defaultValue={initial.shortName}
          placeholder="e.g. GDG, CodeChef"
        />
        <span className="hint">A short label used in tight spaces (chips, calendar).</span>
      </div>

      {canEditStructural ? (
        <>
          <div className="field">
            <label htmlFor="slug">Slug</label>
            <input
              id="slug"
              name="slug"
              required
              minLength={2}
              maxLength={60}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              defaultValue={initial.slug}
              placeholder="coding-club"
            />
            <span className="hint">
              Lowercase words joined by hyphens. This is the public URL:{" "}
              <code>/clubs/{initial.slug || "your-slug"}</code>
              {creating ? "" : " — changing it changes that link."}
            </span>
          </div>

          <div className="admin-form-row">
            <div className="field">
              <label htmlFor="category">Category</label>
              <select id="category" name="category" defaultValue={initial.category}>
                {CLUB_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CLUB_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="color">Calendar colour</label>
              <input
                id="color"
                name="color"
                type="color"
                defaultValue={initial.color || "#1f7a4d"}
                style={{ width: 64, height: 38, padding: 2 }}
              />
            </div>
            <div className="field">
              <label htmlFor="sort">Sort order</label>
              <input
                id="sort"
                name="sort"
                type="number"
                min={0}
                max={9999}
                defaultValue={initial.sort}
                style={{ maxWidth: 100 }}
                placeholder="0"
              />
            </div>
          </div>
        </>
      ) : null}

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

      {canEditStructural ? (
        <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={initial.isActive}
            style={{ width: "auto" }}
          />
          <span>Active (listed on the public site)</span>
        </label>
      ) : null}

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : creating ? "Create club" : "Save changes"}
      </button>
    </form>
  );
}
