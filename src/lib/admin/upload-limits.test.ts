import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { MAX_IMAGE } = await import("./image-upload");
const { PORTRAIT_MAX_BYTES } = await import("./portrait-upload");
const nextConfig = (await import("../../../next.config")).default;

/** "12mb" | "512kb" | 1024 -> bytes. Mirrors Next's SizeLimit parsing. */
function toBytes(limit: string | number): number {
  if (typeof limit === "number") return limit;
  const m = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)$/i.exec(limit.trim());
  if (!m) throw new Error(`unparseable size limit: ${limit}`);
  const mult = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 }[m[2].toLowerCase()]!;
  return Number(m[1]) * mult;
}

/** The biggest file any Server Action is asked to accept. */
const LARGEST_UPLOAD = Math.max(MAX_IMAGE, PORTRAIT_MAX_BYTES);

/**
 * Every admin image upload posts through a Server Action, and Next caps a
 * Server Action body at 1 MB BY DEFAULT — before any of our code runs.
 *
 * That default silently broke every upload over 1 MB across the admin
 * (gallery, announcements, achievements, event posters and team portraits):
 * the forms advertised their own limits, Next answered 413 with an opaque
 * "This page couldn't load" and a digest, and the friendly size message in
 * handleImageUpload was never reached.
 *
 * The limit must stay ABOVE every cap we enforce ourselves, so OURS is the one
 * that fires and the person sees a real message. This test is deliberately
 * written against max(all caps) rather than a literal, so raising any single
 * upload limit without raising this one fails here instead of in production.
 */
describe("server action body limit vs upload caps", () => {
  const limit = nextConfig.experimental?.serverActions?.bodySizeLimit;

  it("is configured at all — the 1 MB default is smaller than every upload we allow", () => {
    expect(limit).toBeDefined();
  });

  it("leaves room for the largest upload any form permits", () => {
    expect(toBytes(limit!)).toBeGreaterThan(LARGEST_UPLOAD);
  });

  it("leaves headroom for the rest of the form, not just the file", () => {
    // Text fields and multipart boundaries ride along with the image.
    expect(toBytes(limit!)).toBeGreaterThanOrEqual(LARGEST_UPLOAD + 512 * 1024);
  });

  // The bucket enforces its own ceiling server-side, so an app limit above it
  // would be rejected by Storage with a message about nothing in particular.
  // council-photos was raised to 10 MB on 2026-09-18 to match.
  it("keeps the portrait cap at the value council-photos allows", () => {
    expect(PORTRAIT_MAX_BYTES).toBe(10 * 1024 * 1024);
  });
});
