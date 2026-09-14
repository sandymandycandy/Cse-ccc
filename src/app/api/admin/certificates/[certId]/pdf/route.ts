import { z } from "zod";
import { requireSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { getIssuedCertificate, renderIssuedCertificate } from "@/lib/admin/certificate-issue";
import { certificateFileName } from "@/lib/certificates/recipients";

/**
 * Download one issued certificate, re-rendered from the design version and the
 * field values recorded when it was issued — so it is the same certificate that
 * was emailed, whatever has changed since (spec §5.1, §5.5).
 */
export async function GET(request: Request, { params }: { params: Promise<{ certId: string }> }) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const { certId } = await params;
  if (!z.string().uuid().safeParse(certId).success) {
    return Response.json({ error: "Missing certificate." }, { status: 400 });
  }
  const cert = await getIssuedCertificate(certId);
  if (!cert) return Response.json({ error: "That certificate no longer exists." }, { status: 404 });

  const event = await getEventForAttendance(cert.eventId);
  if (!event || !canManage(guard.session, "issue:participation_certificate", event.clubId)) {
    return Response.json({ error: "Not permitted." }, { status: 403 });
  }

  let pdf: Uint8Array;
  try {
    pdf = await renderIssuedCertificate(cert);
  } catch (err) {
    console.error("certificate download failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Could not rebuild that certificate." }, { status: 500 });
  }

  const filename = certificateFileName(cert.recipientName, event.title);
  return new Response(new Blob([new Uint8Array(pdf)]).stream(), {
    headers: {
      "content-type": "application/pdf",
      // ASCII fallback plus the real name, so non-Latin names survive the header.
      "content-disposition": `attachment; filename="certificate-${cert.serial}.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "no-store",
    },
  });
}
