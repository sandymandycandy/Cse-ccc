import QRCode from "qrcode";

/**
 * The verification QR (spec §2.2, §6.5) as pure geometry, shared by the editor
 * and the PDF renderer. The symbol becomes horizontal runs of dark modules and
 * then ONE path in module units; both sides draw that path under a transform,
 * so the editor shows exactly what gets printed.
 */

/** Same shape and length as a real serial, so the editor's QR has a real certificate's density. */
export const SAMPLE_SERIAL = "CSE-2026-00000-00000-00000-00000-000000";
/** Blank modules around the symbol, inside the element box — scanners need them. */
export const QUIET_ZONE = 4;
/** Below this printed size phone cameras start to struggle. */
export const MIN_QR_MM = 20;
const A4_LONG_EDGE_MM = 297;

export function verifyUrl(origin: string, serial: string): string {
  return `${origin.replace(/\/+$/, "")}/verify/${encodeURIComponent(serial)}`;
}

export interface QrMatrix {
  size: number;
  dark: (row: number, col: number) => boolean;
}

export function qrMatrix(text: string): QrMatrix {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  return { size: modules.size, dark: (row, col) => modules.get(row, col) === 1 };
}

/** A horizontal run of dark modules, in module units, already offset by the quiet zone. */
export interface QrRun {
  x: number;
  y: number;
  w: number;
}

export function qrRuns(matrix: QrMatrix, quiet = QUIET_ZONE): QrRun[] {
  const runs: QrRun[] = [];
  for (let row = 0; row < matrix.size; row++) {
    let start = -1;
    for (let col = 0; col <= matrix.size; col++) {
      const dark = col < matrix.size && matrix.dark(row, col);
      if (dark && start < 0) start = col;
      if (!dark && start >= 0) {
        runs.push({ x: start + quiet, y: row + quiet, w: col - start });
        start = -1;
      }
    }
  }
  return runs;
}

/** One SVG path (y down) filling every run. */
export function qrPath(runs: QrRun[]): string {
  return runs.map((r) => `M${r.x} ${r.y}h${r.w}v1h-${r.w}z`).join("");
}

/** Modules across, quiet zone included on both sides. */
export const qrSpan = (matrix: QrMatrix, quiet = QUIET_ZONE): number => matrix.size + 2 * quiet;

/** The largest square inside a box, centred. A QR is always drawn square, whatever its box. */
export function qrSquare(box: { x: number; y: number; w: number; h: number }): { x: number; y: number; side: number } {
  const side = Math.min(box.w, box.h);
  return { x: box.x + (box.w - side) / 2, y: box.y + (box.h - side) / 2, side };
}

/** Printed size of a page-pixel length, with the page's long edge at A4's 297 mm (as the renderer prints it). */
export function qrPrintedMm(sidePx: number, page: { widthPx: number; heightPx: number }): number {
  return (sidePx / Math.max(page.widthPx, page.heightPx)) * A4_LONG_EDGE_MM;
}
