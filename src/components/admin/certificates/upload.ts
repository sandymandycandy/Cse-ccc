"use client";

import { createClient } from "@/lib/supabase/client";
import { createCertificateUploadAction } from "@/app/admin/(app)/events/[id]/certificates/actions";
import { CERT_ASSET_BUCKET, type AssetRef } from "@/lib/certificates/design";
import { prepareImage, type AssetKind } from "./image-prep";

/**
 * Prepare a picked image in the browser, then upload it straight to the
 * private certificate-assets bucket through a one-path signed upload URL
 * (spec §6.4) — no server-action body limit involved. Returns the asset ref
 * plus a local object URL to show it immediately. Throws a user-facing Error.
 */
export async function uploadCertificateAsset(
  eventId: string,
  file: File,
  kind: AssetKind,
): Promise<{ ref: AssetRef; localUrl: string }> {
  const prepared = await prepareImage(file, kind);
  const contentType = prepared.type === "png" ? "image/png" : "image/jpeg";
  const ticket = await createCertificateUploadAction({ eventId, contentType, size: prepared.blob.size });
  if (!ticket.ok) throw new Error(ticket.error);

  const { error } = await createClient()
    .storage.from(CERT_ASSET_BUCKET)
    .uploadToSignedUrl(ticket.path, ticket.token, prepared.blob, { contentType });
  if (error) throw new Error("Upload failed. Check your connection and try again.");

  return {
    ref: { bucket: CERT_ASSET_BUCKET, path: ticket.path, type: prepared.type, widthPx: prepared.width, heightPx: prepared.height },
    localUrl: URL.createObjectURL(prepared.blob),
  };
}
