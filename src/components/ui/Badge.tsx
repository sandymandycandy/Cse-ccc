import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { SeatStatus } from "@/lib/types";

type Tone = "open" | "fast" | "full";

const TONE: Record<Tone, string> = {
  open: "badge-open",
  fast: "badge-fast",
  full: "badge-full",
};

export function Badge({
  tone = "open",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return <span className={cn("badge", TONE[tone], className)}>{children}</span>;
}

/** Default label + tone for a seat status, used across event surfaces. */
export function SeatBadge({ status }: { status: SeatStatus }) {
  const label =
    status === "open" ? "Open" : status === "fast" ? "Filling fast" : "Full";
  return <Badge tone={status}>{label}</Badge>;
}
