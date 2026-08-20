import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Filter chip. Presentational — the parent owns `pressed` state so a chip can be
 * used in a server component (static) or wired to client state for filtering.
 */
export function Chip({
  pressed = false,
  className,
  children,
  ...props
}: Omit<ComponentProps<"button">, "className" | "aria-pressed"> & {
  pressed?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cn("chip", className)}
      {...props}
    >
      {children}
    </button>
  );
}
