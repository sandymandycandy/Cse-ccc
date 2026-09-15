import { describe, expect, it } from "vitest";
import { BULK_PRIORITY, INSERT_CHUNK, chunk } from "./bulk";

describe("chunk", () => {
  it("splits into equal parts", () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });

  it("keeps a short final chunk", () => {
    expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });

  it("returns nothing for an empty list", () => {
    expect(chunk([], 10)).toEqual([]);
  });

  it("returns one chunk when the list is smaller than the size", () => {
    expect(chunk([1], 500)).toEqual([[1]]);
  });

  it("handles a 908-row list at the real insert size", () => {
    const rows = Array.from({ length: 908 }, (_, i) => i);
    const out = chunk(rows, INSERT_CHUNK);
    expect(out.length).toBe(2);
    expect(out[0].length).toBe(500);
    expect(out[1].length).toBe(408);
    expect(out.flat()).toEqual(rows);
  });
});

describe("BULK_PRIORITY", () => {
  it("sorts after transactional mail, which uses 3 to 5", () => {
    expect(BULK_PRIORITY).toBeGreaterThan(5);
  });
});
