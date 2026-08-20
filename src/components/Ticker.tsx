/**
 * Marquee ticker. Items are duplicated so the -50% keyframe loops seamlessly.
 * Respects prefers-reduced-motion (animation disabled globally in globals.css).
 */
export function Ticker({ items }: { items: string[] }) {
  const doubled = [...items, ...items];
  return (
    <div className="ticker" aria-label="Announcements">
      <div>
        {doubled.map((text, i) => (
          <span key={i} aria-hidden={i >= items.length}>
            <span style={{ color: "var(--forest)" }}>·</span> {text}
          </span>
        ))}
      </div>
    </div>
  );
}
