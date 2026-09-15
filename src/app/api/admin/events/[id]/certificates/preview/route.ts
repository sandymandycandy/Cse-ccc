import { z } from "zod";
import { requireSameOrigin, requireSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { getGroup, getCertificateWorkspace, groupContext } from "@/lib/admin/certificates";
import { assetLoader, verifyNewAssets } from "@/lib/certificates/assets";
import { validateDesign } from "@/lib/certificates/design";
import { fieldNameValue, formatIstDate } from "@/lib/certificates/fields";
import { loadFontFile } from "@/lib/certificates/font-files";
import { renderCertificatesPdf } from "@/lib/certificates/render";
import { siteOrigin } from "@/lib/site-origin";

const PREVIEW_SERIAL = "CSE-PREVIEW";

/** A preview never carries a real serial or issue date. */
const previewValue = (key: string, values: Record<string, string>): string =>
  key === "cert.serial" ? PREVIEW_SERIAL : key === "cert.issueDate" ? formatIstDate(new Date()) : values[key] ?? "";

/**
 * Preview one recipient's certificate from the group's SAVED design — the
 * Recipients tab's row action (spec §3.2). Watermarked, with a placeholder
 * serial, so it can never pass for an issued certificate.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const ev = z.string().uuid().safeParse(id).success ? await getEventForAttendance(id) : null;
  if (!ev || !canManage(guard.session, "issue:participation_certificate", ev.clubId)) {
    return Response.json({ error: "Not permitted." }, { status: 403 });
  }

  const url = new URL(request.url);
  const groupId = url.searchParams.get("group") ?? "";
  const recipientKey = url.searchParams.get("recipient") ?? "";
  if (!z.string().uuid().safeParse(groupId).success) {
    return Response.json({ error: "Missing certificate group." }, { status: 400 });
  }

  const ws = await getCertificateWorkspace(id, guard.session.id, groupId);
  const group = ws?.groups.find((g) => g.id === groupId);
  if (!ws || !group) return Response.json({ error: "That certificate group no longer exists." }, { status: 404 });
  const recipient = ws.recipients.find((r) => r.key === recipientKey);
  if (!recipient) return Response.json({ error: "That person is no longer on the list." }, { status: 404 });

  let pdf: Uint8Array;
  try {
    pdf = await renderCertificatesPdf({
      design: group.design,
      pages: [{ valueFor: (key) => previewValue(key, recipient.values) }],
      loadAsset: assetLoader(),
      loadFont: loadFontFile,
      watermark: "PREVIEW",
      verifyOrigin: siteOrigin() ?? new URL(request.url).origin,
      title: `Preview — ${ws.event.title}`,
    });
  } catch (err) {
    console.error("certificate preview failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Could not build the preview." }, { status: 500 });
  }

  return new Response(new Blob([new Uint8Array(pdf)]).stream(), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'inline; filename="certificate-preview.pdf"',
      "cache-control": "no-store",
    },
  });
}

const Body = z.object({
  groupId: z.string().uuid(),
  design: z.unknown(),
  recipientKey: z.string().max(200).nullable(),
});

/**
 * Preview PDF of the design as currently edited (unsaved changes included),
 * filled for one recipient or with field names, watermarked PREVIEW. Gated like
 * the certificate actions; POST because the design travels in the body.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const badOrigin = requireSameOrigin(request);
  if (badOrigin) return badOrigin;
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const ev = z.string().uuid().safeParse(id).success ? await getEventForAttendance(id) : null;
  if (!ev || !canManage(guard.session, "issue:participation_certificate", ev.clubId)) {
    return Response.json({ error: "Not permitted." }, { status: 403 });
  }

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Bad preview request." }, { status: 400 });

  const [ws, group] = await Promise.all([getCertificateWorkspace(id, guard.session.id), getGroup(id, body.data.groupId)]);
  if (!ws || !group) return Response.json({ error: "That certificate group no longer exists." }, { status: 404 });

  const checked = validateDesign(body.data.design, groupContext(ws.event, group));
  if (!checked.ok) return Response.json({ error: checked.error }, { status: 400 });
  const loadAsset = assetLoader();
  const assetProblem = await verifyNewAssets(id, checked.design, group.design, loadAsset);
  if (assetProblem) return Response.json({ error: assetProblem }, { status: 400 });

  const recipient = body.data.recipientKey ? ws.recipients.find((r) => r.key === body.data.recipientKey) : undefined;
  const names = fieldNameValue(ws.catalogue);
  const valueFor = recipient
    ? (key: string) => previewValue(key, recipient.values)
    : (key: string) =>
        key === "cert.serial" || key === "cert.issueDate" ? previewValue(key, {}) : names(key);

  let pdf: Uint8Array;
  try {
    pdf = await renderCertificatesPdf({
      design: checked.design,
      pages: [{ valueFor }],
      loadAsset,
      loadFont: loadFontFile,
      watermark: "PREVIEW",
      // A preview QR encodes the placeholder serial, so it is a dead link by design;
      // the request origin lets it render where the env var is unset (local dev,
      // preview deployments). Issued certificates still require the configured origin.
      verifyOrigin: siteOrigin() ?? new URL(request.url).origin,
      title: `Preview — ${ws.event.title}`,
    });
  } catch (err) {
    console.error("certificate preview failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Could not build the preview." }, { status: 500 });
  }

  // Streamed so a large template never hits a buffered-response size cap.
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(pdf);
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'inline; filename="certificate-preview.pdf"',
      "cache-control": "no-store",
    },
  });
}
