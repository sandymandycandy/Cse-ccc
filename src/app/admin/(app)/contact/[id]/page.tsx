import { notFound } from "next/navigation";
import Link from "next/link";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { getContactMessage } from "@/lib/admin/contact";
import { istDateMedium, istTime } from "@/lib/datetime";
import { setContactHandledAction } from "../actions";

export default async function ContactMessagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireViewPage("manage:contact");
  const { id } = await params;

  const msg = await getContactMessage(id);
  if (!msg) notFound();

  const canHandle = canManage(session, "manage:contact");
  const handled = msg.handledAt != null;
  const mailto = `mailto:${msg.email}?subject=${encodeURIComponent(
    "Re: " + (msg.subject ?? "your message to the CSE Council"),
  )}`;

  return (
    <div className="admin-page" style={{ maxWidth: 680 }}>
      <Link href="/admin/contact" className="label" style={{ color: "var(--forest)" }}>
        ← All messages
      </Link>

      <h1 style={{ margin: "12px 0 0" }}>{msg.subject ?? "(no subject)"}</h1>
      <p className="lead" style={{ marginTop: 8 }}>
        From <strong>{msg.name}</strong> ·{" "}
        <a href={mailto} style={{ color: "var(--forest)" }}>
          {msg.email}
        </a>
      </p>
      <div className="label" style={{ marginTop: 4, color: "var(--ink-3)" }}>
        {istDateMedium(msg.createdAt)} · {istTime(msg.createdAt)}
        {handled ? ` · handled ${istDateMedium(msg.handledAt!)}` : ""}
      </div>

      <div
        className="body-text"
        style={{ marginTop: 24, whiteSpace: "pre-wrap", lineHeight: 1.6 }}
      >
        {msg.message}
      </div>

      <div className="stack" style={{ marginTop: 32, gap: 12, flexDirection: "row", alignItems: "center" }}>
        <a href={mailto} className="btn btn-primary">
          Reply by email
        </a>
        {canHandle ? (
          <form action={setContactHandledAction}>
            <input type="hidden" name="id" value={msg.id} />
            <input type="hidden" name="handled" value={handled ? "false" : "true"} />
            <button type="submit" className="btn">
              {handled ? "Mark as unhandled" : "Mark as handled"}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
