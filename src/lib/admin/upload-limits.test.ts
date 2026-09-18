import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { MAX_IMAGE } = await import("./image-upload");
const nextConfig = (await import("../../../next.config")).default;

/** "6mb" | "512kb" | 1024 -> bytes. Mirrors Next's SizeLimit parsing. */
function toBytes(limit: string | number): number {
  if (typeof limit === "number") return limit;
  const m = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)$/i.exec(limit.trim());
  if (!m) throw new Error(`unparseable size limit: ${limit}`);
  const mult = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 }[m[2].toLowerCase()]!;
  return Number(m[1]) * mult;
}

/**
 * Every admin image upload posts through a Server Action, and Next caps a
 * Server Action body at 1 MB BY DEFAULT — before any of our code runs.
 *
 * That default silently broke every upload over 1 MB across the admin
 * (gallery, announcements, achievements, event posters and team portraits):
 * the forms advertised 5 MB and 2 MB, Next answered 413 with an opaque
 * "This page couldn't load" and digest, and the friendly size message in
 * handleImageUpload was never reached.
 *
 * The limit must stay ABOVE our own caps so OUR check is the one that fires
 * and the person sees a real message.
 */
describe("server action body limit vs upload caps", () => {
  const limit = nextConfig.experimental?.serverActions?.bodySizeLimit;

  it("is configured at all — the 1 MB default is smaller than every upload we allow", () => {
    expect(limit).toBeDefined();
  });

  it("leaves room for the largest upload handleImageUpload permits", () => {
    expect(toBytes(limit!)).toBeGreaterThan(MAX_IMAGE);
  });

  it("leaves headroom for the rest of the form, not just the file", () => {
    // Text fields and multipart boundaries ride along with the image.
    expect(toBytes(limit!)).toBeGreaterThanOrEqual(MAX_IMAGE + 512 * 1024);
  });
});
