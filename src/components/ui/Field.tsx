import type { ComponentProps, ReactNode } from "react";
import { useId } from "react";
import { cn } from "@/lib/cn";

/**
 * Labelled input with hint + error, matching the design-system `.field`.
 * Every input is labelled and errors are wired via aria-describedby /
 * aria-invalid (BUILD_PLAN §4 accessibility).
 */
export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: boolean;
  className?: string;
  /** Render prop receives the id + describedby to bind to the control. */
  children: (props: {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
  }) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("field", error && "err", className)}>
      <label htmlFor={id}>{label}</label>
      {children({
        id,
        "aria-describedby": hintId,
        "aria-invalid": error || undefined,
      })}
      {hint ? (
        <span className="hint" id={hintId}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/** Bare input carrying the design-system styling (via the `.field` parent). */
export function Input(props: ComponentProps<"input">) {
  return <input {...props} />;
}
