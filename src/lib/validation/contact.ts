import { z } from "zod";

/**
 * Public contact-form input — SECURITY_SPEC §5. `.strict()` rejects unknown
 * keys; `website` is a honeypot that must stay empty; `turnstile` is verified
 * server-side when Turnstile is configured. Mirrors the registration schema.
 */
export const ContactSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Please enter your name (at least 2 characters).")
      .max(80, "Name is too long (max 80 characters)."),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Enter a valid email address.")
      .max(120, "Email is too long (max 120 characters)."),
    subject: z
      .string()
      .trim()
      .max(140, "Subject is too long (max 140 characters).")
      .optional()
      .default(""),
    message: z
      .string()
      .trim()
      .min(5, "Please write at least 5 characters.")
      .max(4000, "Message is too long (max 4000 characters)."),
    website: z.string().max(0, "bot").optional().default(""), // honeypot
    turnstile: z.string().optional(),
  })
  .strict();

export type ContactInput = z.infer<typeof ContactSchema>;
