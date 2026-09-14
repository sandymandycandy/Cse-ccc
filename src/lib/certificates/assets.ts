import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  assetKey,
  assetRefsOf,
  CERT_ASSET_BUCKET,
  LEGACY_TEMPLATE_BUCKET,
  MAX_ASSET_BYTES,
  type AssetRef,
  type Design,
} from "./design";
import { sniffImage } from "./image-type";

/** Signed view URLs last an hour; the editor page re-signs on every load. */
const SIGNED_URL_SECONDS = 60 * 60;

/** Browser-viewable URLs for design assets, keyed by assetKey(). */
export async function signAssetUrls(refs: AssetRef[]): Promise<Record<string, string>> {
  const admin = createAdminClient();
  const out: Record<string, string> = {};
  const privatePaths = [...new Set(refs.filter((r) => r.bucket === CERT_ASSET_BUCKET).map((r) => r.path))];
  if (privatePaths.length) {
    const { data } = await admin.storage.from(CERT_ASSET_BUCKET).createSignedUrls(privatePaths, SIGNED_URL_SECONDS);
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) out[assetKey({ bucket: CERT_ASSET_BUCKET, path: item.path })] = item.signedUrl;
    }
  }
  for (const ref of refs.filter((r) => r.bucket === LEGACY_TEMPLATE_BUCKET)) {
    out[assetKey(ref)] = admin.storage.from(LEGACY_TEMPLATE_BUCKET).getPublicUrl(ref.path).data.publicUrl;
  }
  return out;
}

/** A per-run loader that downloads each asset once. Throws a user-facing Error when one is missing. */
export function assetLoader(): (ref: AssetRef) => Promise<Uint8Array> {
  const cache = new Map<string, Promise<Uint8Array>>();
  return (ref) => {
    const key = assetKey(ref);
    let pending = cache.get(key);
    if (!pending) {
      pending = (async () => {
        const { data, error } = await createAdminClient().storage.from(ref.bucket).download(ref.path);
        if (error || !data) throw new Error("An image in the design is missing from storage. Upload it again.");
        return new Uint8Array(await data.arrayBuffer());
      })();
      cache.set(key, pending);
    }
    return pending;
  };
}

/**
 * Assets that are new in `next` (not in `previous`) must be this event's own
 * uploads and really be the PNG/JPEG they claim (magic bytes and pixel size,
 * spec §8). Returns a user-facing problem, or null when all is well.
 */
export async function verifyNewAssets(
  eventId: string,
  next: Design,
  previous: Design,
  load: (ref: AssetRef) => Promise<Uint8Array> = assetLoader(),
): Promise<string | null> {
  const known = new Set(assetRefsOf(previous).map(assetKey));
  for (const ref of assetRefsOf(next)) {
    if (known.has(assetKey(ref))) continue;
    if (ref.bucket !== CERT_ASSET_BUCKET || !ref.path.startsWith(`${eventId}/`)) {
      return "An image in the design doesn't belong to this event.";
    }
    let bytes: Uint8Array;
    try {
      bytes = await load(ref);
    } catch {
      return "An uploaded image is missing. Upload it again.";
    }
    if (bytes.byteLength > MAX_ASSET_BYTES) return "An uploaded image is over 8 MB.";
    const image = sniffImage(bytes);
    if (!image || image.type !== ref.type || image.width !== ref.widthPx || image.height !== ref.heightPx) {
      return "An uploaded file isn't the image it claims to be. Upload it again.";
    }
    known.add(assetKey(ref));
  }
  return null;
}
