export type ClassValue = string | number | false | null | undefined;

/** Tiny classnames joiner — avoids a dependency for the common case. */
export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(" ");
}
