import { qrMatrix, qrPath, qrRuns, qrSpan, qrSquare } from "@/lib/certificates/qr";

/**
 * The verification QR in the editor's page-sized SVG: the same path the PDF
 * draws, under the same placement — the largest centred square, one unit per module.
 */
export function QrSvg({ box, color, text }: { box: { x: number; y: number; w: number; h: number }; color: string; text: string }) {
  const matrix = qrMatrix(text);
  const square = qrSquare(box);
  const moduleSize = square.side / qrSpan(matrix);
  return (
    <g transform={`translate(${square.x} ${square.y}) scale(${moduleSize})`}>
      <path d={qrPath(qrRuns(matrix))} fill={color} shapeRendering="crispEdges" />
    </g>
  );
}
