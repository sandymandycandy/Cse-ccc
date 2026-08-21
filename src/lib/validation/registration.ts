import { z } from "zod";
import { DEPARTMENTS } from "@/lib/departments";

/**
 * Registration input — SECURITY_SPEC §5. `.strict()` rejects unknown keys;
 * `website` is a honeypot that must be empty; `turnstile` is verified server-side
 * when Turnstile is configured. Never trust client-supplied ids beyond shape.
 */
export const RegistrationSchema = z
  .object({
    eventId: z.string().uuid(),
    studentName: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[\p{L}\p{M} .'-]+$/u, "Use letters, spaces, . ' - only"),
    rollNo: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{6,15}$/, "Enter a valid roll number"),
    department: z.enum(DEPARTMENTS),
    year: z.coerce.number().int().min(1).max(5),
    email: z.string().trim().toLowerCase().email().max(120),
    phone: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number"),
    website: z.string().max(0, "bot").optional().default(""), // honeypot
    turnstile: z.string().optional(),
  })
  .strict();

export type RegistrationInput = z.infer<typeof RegistrationSchema>;
