import { z } from "zod";
import { requireSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { getCertificateWorkspace } from "@/lib/admin/certificates";
import { getIssuedCertificates } from "@/lib/admin/certificate-issue";
import { assetLoader } from "@/lib/certificates/assets";
import { loadFontFile } from "@/lib/certificates/font-files";
import { renderCertificatesPdf } from "@/lib/certificates/render";

/** A run this big is better split — and it keeps the function well inside its timeout. */
const MAX_PAGES = 300;

/**
 * One printable PDF holding every issued certificate in a group (spec §5.5).
 * The template and its images are embedded once and shared by every page, so a
 * 200-page booklet is barely larger than a single certificate.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const event = z.string().uuid().safeParse(id).success ? await getEventForAttendance(id) : null;
  if (!event || !canManage(guard.session, "issue:participation_certificate", event.clubId)) {
    return Response.json({ error: "Not permitted." }, { status: 403 });
  }

  const groupId = new URL(request.url).searchParams.get("group") ?? undefined;
  const ws = await getCertificateWorkspace(id, guard.session.id, groupId);
  if (!ws) return Response.json({ error: "That event no longer exists." }, { status: 404 });

  const issued = ws.recipients.filter((r) => r.groupId === ws.group.id && r.status.state === "issued");
  if (issued.length === 0) {
    return Response.json({ error: "Nothing issued in that group yet." }, { status: 400 });
  }
  if (issued.length > MAX_PAGES) {
    return Response.json(
      { error: `That group has ${issued.length} certificates. Print in groups of ${MAX_PAGES} or fewer.` },
      { status: 400 },
    );
  }

  // Each page is drawn from the certificate's OWN design version and snapshot,
  // so the booklet matches what each person received rather than today's design.
  const certificates = await getIssuedCertificates(
    issued.map((r) => (r.status.state === "issued" ? r.status.certificateId : "")).filter(Boolean),
  );
  const pages = certificates.map((cert) => ({
    design: cert.design,
    valueFor: (key: string) => cert.values[key] ?? "",
  }));
  if (pages.length === 0) return Response.json({ error: "Could not rebuild those certificates." }, { status: 500 });

  let pdf: Uint8Array;
  try {
    pdf = await renderCertificatesPdf({
      design: ws.group.design,
      pages,
      loadAsset: assetLoader(),
      loadFont: loadFontFile,
      title: `${ws.event.title} — ${ws.group.name}`,
    });
  } catch (err) {
    console.error("certificate print failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Could not build the print PDF." }, { status: 500 });
  }

  return new Response(new Blob([new Uint8Array(pdf)]).stream(), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="certificates-${ws.group.kind}-${pages.length}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
