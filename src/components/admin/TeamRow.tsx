"use client";

import { useActionState } from "react";
import { TeamAvatar } from "@/components/TeamAvatar";
import type { TeamLinksState } from "@/lib/admin/form-state";
import type { TeamAdminRow } from "@/lib/admin/team";

type SaveAction = (prev: TeamLinksState, formData: FormData) => Promise<TeamLinksState>;

const initial: TeamLinksState = {};

/**
 * One member's row in the /admin/team editor: their two social links (saved
 * together) and the Public/Hidden control (its own form, so toggling never
 * depends on the link fields validating).
 */
export function TeamRow({
  member,
  saveAction,
  visibilityAction,
  canEdit,
}: {
  member: TeamAdminRow;
  saveAction: SaveAction;
  visibilityAction: (formData: FormData) => void | Promise<void>;
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveAction, initial);

  return (
    <div
      className="panel"
      style={{ padding: 16, borderRadius: "var(--r-md)", display: "grid", gap: 12 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <TeamAvatar name={member.name} photoUrl={member.photoUrl} size={44} />
          <div>
            <div style={{ fontWeight: 500 }}>{member.name}</div>
            <div className="label" style={{ marginTop: 4 }}>
              {member.designation}
              {member.rollNo ? ` · VTU ${member.rollNo}` : ""}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            className="label"
            style={{ color: member.isPublic ? "var(--forest)" : "var(--ink-3)" }}
          >
            {member.isPublic ? "Public" : "Hidden"}
          </span>
          {canEdit ? (
            <form action={visibilityAction}>
              <input type="hidden" name="id" value={member.id} />
              {/* Post the desired state, never a flip of what was rendered — a
                  stale tab must not publish someone by toggling the wrong way. */}
              <input type="hidden" name="next" value={member.isPublic ? "hidden" : "public"} />
              <button type="submit" className="btn btn-sm">
                {member.isPublic ? "Hide" : "Publish"}
              </button>
            </form>
          ) : null}
        </div>
      </div>

      {/* A member who is inactive on the attendance roster never reaches /team even
          when published, which would otherwise look like a broken toggle. */}
      {member.isPublic && !member.isActive ? (
        <div className="note" style={{ borderLeftColor: "var(--rust)" }}>
          Published, but inactive on the roster — so this person does <strong>not</strong>{" "}
          appear on /team. Mark them active in Council → Members.
        </div>
      ) : null}

      {canEdit ? (
        <form action={formAction} style={{ display: "grid", gap: 10 }}>
          <input type="hidden" name="id" value={member.id} />
          {state.error ? (
            <div className="note" style={{ borderLeftColor: "var(--rust)" }}>{state.error}</div>
          ) : null}
          <div className="admin-form-row">
            <div className="field">
              <label htmlFor={`li-${member.id}`}>LinkedIn</label>
              <input
                id={`li-${member.id}`}
                name="linkedinUrl"
                type="url"
                maxLength={300}
                defaultValue={member.linkedinUrl ?? ""}
                placeholder="https://linkedin.com/in/…"
              />
            </div>
            <div className="field">
              <label htmlFor={`ig-${member.id}`}>Instagram</label>
              <input
                id={`ig-${member.id}`}
                name="instagramUrl"
                type="url"
                maxLength={300}
                defaultValue={member.instagramUrl ?? ""}
                placeholder="https://instagram.com/…"
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor={`bio-${member.id}`}>Description</label>
            <textarea
              id={`bio-${member.id}`}
              name="bio"
              rows={3}
              maxLength={800}
              defaultValue={member.bio ?? ""}
              placeholder="A sentence or two about them, shown on their profile page."
            />
            <span className="hint">
              Plain text, up to 800 characters. Line breaks are kept. Replaces the
              default &ldquo;Part of the CSE Club Council&hellip;&rdquo; paragraph.
            </span>
          </div>

          <div className="field">
            <label htmlFor={`photo-${member.id}`}>
              {member.photoUrl ? "Replace photo" : "Photo"}
            </label>
            <input
              id={`photo-${member.id}`}
              name="photo"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
            />
            <span className="hint">
              PNG, JPEG, WebP or GIF, up to 2 MB. Square images look best — it is
              shown as a circle. Leaving this empty keeps the current photo.
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button type="submit" className="btn btn-sm btn-primary" disabled={pending}>
              {pending ? "Saving…" : "Save details"}
            </button>
            {state.saved && !pending ? (
              <span className="label" style={{ color: "var(--forest)" }}>Saved</span>
            ) : null}
          </div>
        </form>
      ) : (
        <div className="label">
          {member.linkedinUrl ? "LinkedIn set" : "No LinkedIn"} ·{" "}
          {member.instagramUrl ? "Instagram set" : "No Instagram"}
        </div>
      )}
    </div>
  );
}
