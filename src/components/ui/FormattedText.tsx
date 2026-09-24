import type { CSSProperties } from "react";

/**
 * Organiser-typed text (event description, rules) with its line breaks kept.
 * A plain <p> collapses every newline into a space, so a pasted description
 * with a prize list read as one run-on paragraph. Blank lines start a new
 * paragraph; single line breaks stay line breaks (`pre-line`).
 */
export function FormattedText({
  text,
  className,
  style,
}: {
  text: string;
  className?: string;
  style?: CSSProperties;
}) {
  const paras = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <div className="formatted-text" style={style}>
      {paras.map((p, i) => (
        <p key={i} className={className}>
          {p}
        </p>
      ))}
    </div>
  );
}
