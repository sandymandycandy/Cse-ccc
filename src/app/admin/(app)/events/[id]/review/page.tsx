import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { getEventForReview } from "@/lib/admin/queries";
import { approveEventAction, rejectEventAction } from "@/app/admin/(app)/events/actions";
import { validateFormSchema, type FormField } from "@/lib/registration-form/schema";
import { istFullDate, istTime } from "@/lib/datetime";

export default async function ReviewEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireViewPage("approve:events");
  const { id } = await params;
  const ev = await getEventForReview(id);
  if (!ev) notFound();

  const canDecide = canManage(session, "approve:events");
  const parsed = ev.registrationForm ? validateFormSchema(ev.registrationForm) : null;
  const fields: FormField[] = parsed && parsed.ok ? parsed.fields : [];

  return (
    <div className="admin-page" style={{ maxWidth: 720 }}>
      <Link href="/admin/events/approvals" className="label" style={{ color: "var(--forest)" }}>
        ← Approval queue
      </Link>
      <div className="admin-page-head" style={{ marginTop: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">Review event</div>
          <h1 style={{ margin: "6px 0 0" }}>{ev.title}</h1>
          <p className="body-text" style={{ marginTop: 6, color: "var(--ink-2)" }}>
            {ev.club ?? "—"} · {istFullDate(ev.startsAt)} · {istTime(ev.startsAt)}–{istTime(ev.endsAt)}
            {ev.submittedBy ? ` · submitted by ${ev.submittedBy}` : ""}
          </p>
        </div>
        <span className={`abadge${ev.approvalStatus === "approved" ? " abadge-approved" : ""}`}>
          {ev.approvalStatus[0].toUpperCase() + ev.approvalStatus.slice(1)}
        </span>
      </div>

      {ev.approvalStatus === "rejected" && ev.rejectionReason ? (
        <div className="note" style={{ marginTop: 14, borderLeftColor: "var(--rust)" }}>
          Previously rejected: {ev.rejectionReason}
        </div>
      ) : null}

      {ev.posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ev.posterUrl}
          alt=""
          style={{ width: "100%", maxHeight: 280, objectFit: "cover", borderRadius: "var(--r-sm)", marginTop: 16 }}
        />
      ) : null}

      <dl className="review-grid" style={{ marginTop: 20, display: "grid", gap: 12 }}>
        <Detail label="Venue">{ev.venueText || "—"}</Detail>
        <Detail label="Registration">
          {ev.selectionMode === "shortlist"
            ? "Shortlist — collect everyone, select later"
            : `Seats${ev.capacity != null ? ` · capacity ${ev.capacity}` : ""}`}
        </Detail>
        <Detail label="Description">
          <span style={{ whiteSpace: "pre-wrap" }}>{ev.description || "—"}</span>
        </Detail>
      </dl>

      <h2 style={{ font: "400 18px var(--serif)", margin: "28px 0 8px" }}>
        Registration form ({fields.length} {fields.length === 1 ? "field" : "fields"})
      </h2>
      <FormPreview fields={fields} />

      {canDecide && ev.approvalStatus === "pending" ? (
        <section className="rule" style={{ marginTop: 32, paddingTop: 24 }}>
          <h2 style={{ font: "400 20px var(--serif)", margin: "0 0 12px" }}>Decision</h2>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
            <form action={approveEventAction}>
              <input type="hidden" name="eventId" value={ev.id} />
              <button type="submit" className="btn btn-accent">Approve &amp; publish</button>
            </form>
            <form
              action={rejectEventAction}
              style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
            >
              <input type="hidden" name="eventId" value={ev.id} />
              <input name="reason" placeholder="Reason for the club head" style={{ minWidth: 220 }} />
              <button type="submit" className="btn btn-ghost">Reject</button>
            </form>
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            A rejection is emailed to the club head with your reason; they can edit and resubmit.
          </p>
        </section>
      ) : ev.approvalStatus !== "pending" ? (
        <p className="body-text" style={{ marginTop: 24, color: "var(--ink-3)" }}>
          This event has already been {ev.approvalStatus}.
        </p>
      ) : null}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="label" style={{ marginBottom: 2 }}>{label}</dt>
      <dd style={{ margin: 0 }}>{children}</dd>
    </div>
  );
}

function FormPreview({ fields }: { fields: FormField[] }) {
  if (fields.length === 0) {
    return <p className="body-text" style={{ color: "var(--ink-3)" }}>Default registration form.</p>;
  }
  return (
    <ol className="stack" style={{ gap: 10, paddingLeft: 0, listStyle: "none" }}>
      {fields.map((f) => (
        <li key={f.id} className="card" style={{ padding: 12 }}>
          {f.kind === "section" ? (
            <>
              <strong>{f.label}</strong>
              {f.description ? (
                <div className="hint" style={{ marginTop: 4 }}>{f.description}</div>
              ) : null}
            </>
          ) : f.kind === "team" ? (
            <>
              <strong>{f.label}</strong>{" "}
              <span className="label">
                · team ({f.minMembers ?? 1}–{f.maxMembers ?? 1} members)
              </span>
              <div className="hint" style={{ marginTop: 4 }}>
                Per member: {(f.members ?? []).map((m) => `${m.label}${m.required ? "*" : ""}`).join(", ") || "—"}
              </div>
            </>
          ) : (
            <>
              <strong>{f.label}</strong>
              {f.required ? <span style={{ color: "var(--rust)" }}> *</span> : null}{" "}
              <span className="label">· {f.identity ? `${f.identity} · ` : ""}{f.kind}</span>
              {f.options && f.options.length > 0 ? (
                <div className="hint" style={{ marginTop: 4 }}>
                  Options: {f.options.join(", ")}{f.allowOther ? ", Other…" : ""}
                </div>
              ) : null}
            </>
          )}
        </li>
      ))}
    </ol>
  );
}
