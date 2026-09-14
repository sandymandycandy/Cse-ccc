import { describe, it, expect } from "vitest";
import QRCode from "qrcode";
import { qrMatrix, qrPath, qrPrintedMm, qrRuns, qrSpan, qrSquare, QUIET_ZONE, SAMPLE_SERIAL, verifyUrl } from "./qr";

const SAMPLE_URL = verifyUrl("https://cse-ccc.vercel.app", SAMPLE_SERIAL);

describe("verifyUrl", () => {
  it("joins origin and serial without a double slash", () => {
    expect(verifyUrl("https://x.test/", "CSE-2026-9F3AC1B2")).toBe("https://x.test/verify/CSE-2026-9F3AC1B2");
    expect(verifyUrl("https://x.test", "CSE-2026-9F3AC1B2")).toBe("https://x.test/verify/CSE-2026-9F3AC1B2");
  });
});

describe("qrMatrix", () => {
  it("is the M-level symbol qrcode builds", () => {
    const ref = QRCode.create(SAMPLE_URL, { errorCorrectionLevel: "M" }).modules;
    const m = qrMatrix(SAMPLE_URL);
    expect(m.size).toBe(ref.size);
    for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) expect(m.dark(r, c)).toBe(ref.get(r, c) === 1);
  });
});

describe("qrRuns", () => {
  it("merges each row's dark modules into runs that rebuild the matrix exactly", () => {
    const m = qrMatrix(SAMPLE_URL);
    const rebuilt = Array.from({ length: m.size }, () => new Array<boolean>(m.size).fill(false));
    for (const run of qrRuns(m)) {
      expect(run.w).toBeGreaterThan(0);
      for (let i = 0; i < run.w; i++) {
        const row = run.y - QUIET_ZONE;
        const col = run.x - QUIET_ZONE + i;
        expect(rebuilt[row][col]).toBe(false); // runs never overlap
        rebuilt[row][col] = true;
      }
    }
    for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) expect(rebuilt[r][c]).toBe(m.dark(r, c));
  });

  it("never leaves two touching runs in a row (they would have been one)", () => {
    const runs = qrRuns(qrMatrix(SAMPLE_URL));
    for (let i = 1; i < runs.length; i++) {
      if (runs[i].y === runs[i - 1].y) expect(runs[i].x).toBeGreaterThan(runs[i - 1].x + runs[i - 1].w);
    }
  });
});

describe("qrPath", () => {
  it("draws one closed rectangle per run", () => {
    expect(qrPath([{ x: 4, y: 5, w: 3 }, { x: 9, y: 5, w: 1 }])).toBe("M4 5h3v1h-3zM9 5h1v1h-1z");
  });
});

describe("qrSquare and sizes", () => {
  it("centres the largest square in the box", () => {
    expect(qrSquare({ x: 10, y: 20, w: 100, h: 60 })).toEqual({ x: 30, y: 20, side: 60 });
    expect(qrSquare({ x: 0, y: 0, w: 50, h: 80 })).toEqual({ x: 0, y: 15, side: 50 });
  });

  it("counts the quiet zone on both sides", () => {
    const m = qrMatrix(SAMPLE_URL);
    expect(qrSpan(m)).toBe(m.size + 2 * QUIET_ZONE);
  });

  it("converts page pixels to printed millimetres on an A4 long edge", () => {
    expect(qrPrintedMm(3508, { widthPx: 3508, heightPx: 2480 })).toBeCloseTo(297, 6);
    expect(qrPrintedMm(421, { widthPx: 3508, heightPx: 2480 })).toBeCloseTo(35.64, 1);
  });
});
