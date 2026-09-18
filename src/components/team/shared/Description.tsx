import type { Member } from "@/data/ccc";

/** Submitted description, keeping the author's line breaks. Renders nothing if none was submitted. */
export function Description({ member, className = "" }: { member: Member; className?: string }) {
  if (!member.description) return null;
  return <p className={`whitespace-pre-line ${className}`}>{member.description}</p>;
}
