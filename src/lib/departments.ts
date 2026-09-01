// Department options for registration. Kept dependency-free so the client form
// can import it without pulling in Zod. Stored as free text on registrations.
// No static "Other" — the department field enables `allowOther`, which renders a
// type-your-own "Other…" write-in so students from any department can register.
export const DEPARTMENTS = [
  "CSE",
  "AI & ML",
  "CS & BS",
  "AI & DS",
  "IT",
  "ECE",
  "EEE",
  "MECH",
  "CIVIL",
] as const;

export type Department = (typeof DEPARTMENTS)[number];
