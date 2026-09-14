import { cssFamily } from "@/lib/certificates/fonts";
import type { TextLayout } from "@/lib/certificates/layout";

/**
 * Draw a laid-out text element in the editor's page-sized SVG. Every run is
 * placed at the x the layout engine computed, so the browser never wraps or
 * kerns — the same numbers go into the PDF.
 */
export function TextSvg({ layout }: { layout: TextLayout }) {
  return (
    <g>
      {layout.lines.map((line, li) =>
        line.runs.map((run, ri) => (
          <g key={`${li}.${ri}`}>
            <text
              className="cd-text"
              x={run.x}
              y={line.baseline}
              fontFamily={cssFamily(run.family)}
              fontWeight={run.bold ? 700 : 400}
              fontStyle={run.italic ? "italic" : "normal"}
              fontSize={run.size}
              fill={run.color}
              xmlSpace="preserve"
            >
              {run.text}
            </text>
            {run.underline ? (
              <rect x={run.x} y={run.underline.y} width={run.width} height={run.underline.thickness} fill={run.color} />
            ) : null}
          </g>
        )),
      )}
    </g>
  );
}
