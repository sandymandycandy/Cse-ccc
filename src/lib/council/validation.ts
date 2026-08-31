import { ROLL_RE, PHONE_RE, VELTECH_EMAIL_RE } from "@/lib/roster/validation";

export interface CouncilRegisterValue {
  name: string; roll: string; email: string; phone: string; designation: string;
}

/** Self-register validation for a council member. Reuses the roster field rules
 *  (roll/email/phone + the roll↔email match) and adds a required designation. */
export function validateCouncilRegistration(input: {
  name: unknown; roll: unknown; email: unknown; phone: unknown; designation: unknown;
}): { ok: true; value: CouncilRegisterValue } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const name = String(input.name ?? "").trim();
  const roll = String(input.roll ?? "").trim();
  const email = String(input.email ?? "").trim().toLowerCase();
  const phone = String(input.phone ?? "").trim();
  const designation = String(input.designation ?? "").trim();

  if (name.length < 2 || name.length > 120) errors.name = "Enter your full name.";
  if (!ROLL_RE.test(roll)) errors.roll = "Roll number must be exactly 5 digits.";
  const m = VELTECH_EMAIL_RE.exec(email);
  if (!m) errors.email = "Use your vtuXXXXX@veltech.edu.in email.";
  else if (ROLL_RE.test(roll) && m[1] !== roll) errors.email = "Email digits must match your roll number.";
  if (!PHONE_RE.test(phone)) errors.phone = "Phone must be exactly 10 digits (no +91).";
  if (designation.length < 2 || designation.length > 80)
    errors.designation = "Enter your role (e.g. Robotics Club Head).";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { name, roll, email, phone, designation } };
}
