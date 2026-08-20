import { cn } from "@/lib/cn";

/** 4px capacity bar. `tone="full"` turns it rust for a full/waitlisted event. */
export function ProgressBar({
  value,
  tone = "forest",
  className,
  label,
}: {
  /** 0–100 */
  value: number;
  tone?: "forest" | "rust";
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("bar", className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <i
        style={{
          width: `${pct}%`,
          background: tone === "rust" ? "var(--rust)" : "var(--forest)",
        }}
      />
    </div>
  );
}
