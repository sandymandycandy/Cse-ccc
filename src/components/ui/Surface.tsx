import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({
  className,
  children,
  ...props
}: ComponentProps<"div"> & { children: ReactNode }) {
  return (
    <div className={cn("card", className)} {...props}>
      {children}
    </div>
  );
}

export function Panel({
  className,
  children,
  ...props
}: ComponentProps<"div"> & { children: ReactNode }) {
  return (
    <div className={cn("panel", className)} {...props}>
      {children}
    </div>
  );
}

/** Left-accented callout (design-system `.note`). */
export function Note({
  className,
  children,
  ...props
}: ComponentProps<"div"> & { children: ReactNode }) {
  return (
    <div className={cn("note", className)} {...props}>
      {children}
    </div>
  );
}
