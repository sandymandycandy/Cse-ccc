export const ROLL_RE = /^\d{5}$/;
export const PHONE_RE = /^\d{10}$/;
export const VELTECH_EMAIL_RE = /^vtu(\d{5})@veltech\.edu\.in$/i;
export const MAX_PHOTO_BYTES = 200 * 1024;
export const PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export interface RegisterValue { name: string; roll: string; email: string; phone: string }

export function validateRegistration(input: {
  name: unknown; roll: unknown; email: unknown; phone: unknown;
}): { ok: true; value: RegisterValue } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const name = String(input.name ?? "").trim();
  const roll = String(input.roll ?? "").trim();
  const email = String(input.email ?? "").trim().toLowerCase();
  const phone = String(input.phone ?? "").trim();

  if (name.length < 2 || name.length > 120) errors.name = "Enter your full name.";
  if (!ROLL_RE.test(roll)) errors.roll = "Roll number must be exactly 5 digits.";
  const m = VELTECH_EMAIL_RE.exec(email);
  if (!m) errors.email = "Use your vtuXXXXX@veltech.edu.in email.";
  else if (ROLL_RE.test(roll) && m[1] !== roll) errors.email = "Email digits must match your roll number.";
  if (!PHONE_RE.test(phone)) errors.phone = "Phone must be exactly 10 digits (no +91).";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { name, roll, email, phone } };
}

export function validatePhoto(file: { size: number; type: string } | null): string | null {
  if (!file || file.size === 0) return "A passport photo is required.";
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) return "Photo must be PNG, JPEG or WebP.";
  if (file.size > MAX_PHOTO_BYTES) return "Photo must be 200 KB or smaller.";
  return null;
}
