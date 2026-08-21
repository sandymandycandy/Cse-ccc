// Department options for registration. Kept dependency-free so the client form
// can import it without pulling in Zod. Stored as free text on registrations.
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
  "Other",
] as const;

export type Department = (typeof DEPARTMENTS)[number];
