"use client";

import { useActionState, useEffect, useState } from "react";
import type { TeamProfileState } from "@/lib/admin/form-state";
import { FieldError, fieldClass } from "@/components/admin/FieldError";

type SaveAction = (prev: TeamProfileState, formData: FormData) => Promise<TeamProfileState>;

const initial: TeamProfileState = {};

/**
 * Everything the row needs, computed on the server. Plain serialisable values
 * only — this component deliberately does not import src/data/ccc.ts, which
 * would drag 45 portrait imports into the admin bundle.
 */
export type TeamProfileRowData = {
  memberId: string;
  name: string;
  role: string;
  email: string;
  year: string | null;
  department: string | null;
  description: string | null;
  portfolio: string | null;
  /** Where they sit on /team, e.g. "Coding Club". Set in code, not here. */
  placement: string;
  /** False until the person has been saved or synced once. */
  hasRow: boolean;
  /** The portrait /team shows now: the upload if any, else the bundled one. */
  photoUrl: string | null;
  hasUpload: boolean;
  /** object-position for the preview when there is no upload — the bundled
   *  portrait's own hand-tuned framing. */
  bundledPosition: string;
  focalX: number;
  focalY: number;
};

/**
 * One person's editor on /admin/team, backed by team_profiles — the table the
 * public /team page renders. Follows TeamRow's conventions.
 */
export function TeamProfileRow({
  row,
  saveAction,
  canEdit,
}: {
  row: TeamProfileRowData;
  saveAction: SaveAction;
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveAction, initial);
  /** Object URL of a newly chosen file, for the preview only. */
  const [picked, setPicked] = useState<string | null>(null);
  const [fx, setFx] = useState(row.focalX);
  const [fy, setFy] = useState(row.focalY);

  // Each object URL pins the file's bytes in memory until revoked. The cleanup
  // captures the PREVIOUS url, so it runs when a new file replaces it and when
  // the row unmounts.
  useEffect(() => {
    return () => {
      if (picked) URL.revokeObjectURL(picked);
    };
  }, [picked]);

  // Framing only means something for an UPLOADED photo. A bundled portrait
  // always crops with its own hand-tuned focal point from src/data/ccc.ts, so
  // showing these controls for it would be a control that does nothing.
  const showFraming = row.hasUpload || picked != null;
  const previewUrl = picked ?? row.photoUrl;
  const previewPosition = showFraming ? `${fx}% ${fy}%` : row.bundledPosition;
  const id = (field: string) => `${field}-${row.memberId}`;

  return (
    <div className="panel" style={{ padding: 16, borderRadius: "var(--r-md)", display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div
          style={{
            width: 56,
            aspectRatio: "4 / 5",
            borderRadius: "var(--r-sm)",
            overflow: "hidden",
            background: "var(--sand)",
            flex: "none",
          }}
        >
          {previewUrl ? (
            // An admin preview, and a just-chosen file is an object URL that
            // next/image cannot take — same exception as the gallery editor.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: previewPosition }}
            />
          ) : null}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 500 }}>{row.name}</div>
          <div className="label" style={{ marginTop: 4 }}>
            {row.role} · {row.placement}
            {row.hasRow ? null : (
              <span style={{ color: "var(--ink-3)" }}> · showing the form&rsquo;s answers</span>
            )}
          </div>
        </div>
      </div>

      {canEdit ? (
        <form action={formAction} style={{ display: "grid", gap: 10 }}>
          <input type="hidden" name="memberId" value={row.memberId} />
          {state.error ? (
            <div className="note" style={{ borderLeftColor: "var(--rust)" }}>{state.error}</div>
          ) : null}

          <div className="admin-form-row">
            <div className={fieldClass(state.fieldErrors, "name")}>
              <label htmlFor={id("name")}>Name</label>
              <input id={id("name")} name="name" required maxLength={120} defaultValue={row.name} />
              <FieldError errors={state.fieldErrors} name="name" />
            </div>
            <div className={fieldClass(state.fieldErrors, "role")}>
              <label htmlFor={id("role")}>Role</label>
              <input id={id("role")} name="role" required maxLength={120} defaultValue={row.role} />
              <span className="hint">
                Printed as written. A role starting with <code>Head</code> is listed first in
                its club. It does <strong>not</strong> move anyone between sections — where a
                person appears is set in code.
              </span>
              <FieldError errors={state.fieldErrors} name="role" />
            </div>
          </div>

          <div className="admin-form-row">
            <div className={fieldClass(state.fieldErrors, "year")}>
              <label htmlFor={id("year")}>Year</label>
              <input id={id("year")} name="year" maxLength={20} defaultValue={row.year ?? ""} placeholder="III" />
              <FieldError errors={state.fieldErrors} name="year" />
            </div>
            <div className={fieldClass(state.fieldErrors, "department")}>
              <label htmlFor={id("department")}>Department</label>
              <input
                id={id("department")}
                name="department"
                maxLength={120}
                defaultValue={row.department ?? ""}
                placeholder="CSE (AIML)"
              />
              <FieldError errors={state.fieldErrors} name="department" />
            </div>
          </div>

          <div className="admin-form-row">
            <div className={fieldClass(state.fieldErrors, "email")}>
              <label htmlFor={id("email")}>Email</label>
              <input id={id("email")} name="email" type="email" required maxLength={120} defaultValue={row.email} />
              <FieldError errors={state.fieldErrors} name="email" />
            </div>
            <div className={fieldClass(state.fieldErrors, "portfolio")}>
              <label htmlFor={id("portfolio")}>Portfolio link</label>
              <input
                id={id("portfolio")}
                name="portfolio"
                type="url"
                maxLength={300}
                defaultValue={row.portfolio ?? ""}
                placeholder="https://…"
              />
              <FieldError errors={state.fieldErrors} name="portfolio" />
            </div>
          </div>

          <div className={fieldClass(state.fieldErrors, "description")}>
            <label htmlFor={id("description")}>Description</label>
            <textarea
              id={id("description")}
              name="description"
              rows={4}
              maxLength={2000}
              defaultValue={row.description ?? ""}
            />
            <span className="hint">
              Line breaks are kept. Leaving a field empty shows what the person wrote on the form.
            </span>
            <FieldError errors={state.fieldErrors} name="description" />
          </div>

          <div className={fieldClass(state.fieldErrors, "photo")}>
            <label htmlFor={id("photo")}>{row.photoUrl ? "Replace photo" : "Photo"}</label>
            <input
              id={id("photo")}
              name="photo"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                setPicked(file ? URL.createObjectURL(file) : null);
                // A different photo has a different face position; the old
                // framing would be wrong for it.
                if (file) {
                  setFx(50);
                  setFy(50);
                }
              }}
            />
            <span className="hint">
              PNG, JPEG, WebP or GIF, up to 2 MB. A head-and-shoulders portrait, same style as the
              others. Leaving this empty keeps the current photo.
            </span>
            <FieldError errors={state.fieldErrors} name="photo" />
          </div>

          {showFraming ? (
            <div className="admin-form-row">
              <div className={fieldClass(state.fieldErrors, "focalX")}>
                <label htmlFor={id("focalX")}>Face across (%)</label>
                <input
                  id={id("focalX")}
                  name="focalX"
                  type="number"
                  min={0}
                  max={100}
                  value={fx}
                  onChange={(e) => setFx(Number(e.currentTarget.value))}
                />
                <FieldError errors={state.fieldErrors} name="focalX" />
              </div>
              <div className={fieldClass(state.fieldErrors, "focalY")}>
                <label htmlFor={id("focalY")}>Face down (%)</label>
                <input
                  id={id("focalY")}
                  name="focalY"
                  type="number"
                  min={0}
                  max={100}
                  value={fy}
                  onChange={(e) => setFy(Number(e.currentTarget.value))}
                />
                <span className="hint">
                  Where the face is, as a percentage of the photo. Watch the thumbnail above: keep
                  the face in frame. 50 / 35 suits most portraits.
                </span>
                <FieldError errors={state.fieldErrors} name="focalY" />
              </div>
            </div>
          ) : (
            <>
              {/* Posted unchanged so a save never alters framing it isn't showing. */}
              <input type="hidden" name="focalX" value={row.focalX} />
              <input type="hidden" name="focalY" value={row.focalY} />
            </>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button type="submit" className="btn btn-sm btn-primary" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </button>
            {state.saved && !pending ? (
              <span className="label" style={{ color: "var(--forest)" }}>Saved — live on /team</span>
            ) : null}
          </div>
        </form>
      ) : (
        <div className="label">{row.email}</div>
      )}
    </div>
  );
}
