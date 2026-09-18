import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./image-upload", () => ({ handleImageUpload: vi.fn() }));

const handleImageUpload = vi.mocked((await import("./image-upload")).handleImageUpload);
const { uploadPortrait, PORTRAIT_MAX_BYTES, COUNCIL_PHOTO_BUCKET } = await import("./portrait-upload");

beforeEach(() => handleImageUpload.mockReset());

describe("uploadPortrait", () => {
  // The council-photos bucket caps at 2 MB. handleImageUpload defaults to 5 MB,
  // so without an explicit cap a 3 MB file passes our check and is then
  // rejected by Storage with "Could not upload the image" — a size problem
  // reported as a generic failure.
  it("caps at the bucket's 2 MB, not handleImageUpload's 5 MB default", async () => {
    handleImageUpload.mockResolvedValue({});
    await uploadPortrait(new FormData());
    expect(PORTRAIT_MAX_BYTES).toBe(2 * 1024 * 1024);
    expect(handleImageUpload).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ bucket: "council-photos", field: "photo", maxBytes: 2 * 1024 * 1024 }),
    );
  });

  it("uses the existing council-photos bucket", () => {
    expect(COUNCIL_PHOTO_BUCKET).toBe("council-photos");
  });

  it("returns {} when no file was chosen", async () => {
    handleImageUpload.mockResolvedValue({});
    await expect(uploadPortrait(new FormData())).resolves.toEqual({});
  });

  it("passes an upload error straight through", async () => {
    handleImageUpload.mockResolvedValue({ error: "Image must be 2048 KB or smaller." });
    await expect(uploadPortrait(new FormData())).resolves.toEqual({
      error: "Image must be 2048 KB or smaller.",
    });
  });

  // A real 3x4 JPEG through the real sharp: proves the dimensions and the blur
  // are actually produced, not just that the mock was called.
  it("measures the uploaded image and builds a blur data URL", async () => {
    const sharp = (await import("sharp")).default;
    const jpeg = await sharp({
      create: { width: 30, height: 40, channels: 3, background: { r: 120, g: 90, b: 60 } },
    })
      .jpeg()
      .toBuffer();
    const fd = new FormData();
    fd.set("photo", new File([new Uint8Array(jpeg)], "p.jpg", { type: "image/jpeg" }));
    handleImageUpload.mockResolvedValue({ path: "abc.jpg" });

    const out = await uploadPortrait(fd);
    expect(out.path).toBe("abc.jpg");
    expect(out.width).toBe(30);
    expect(out.height).toBe(40);
    expect(out.blur).toMatch(/^data:image\/webp;base64,/);
  });
});
