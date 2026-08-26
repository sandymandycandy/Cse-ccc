import { z } from "zod";

/**
 * Public contact-form input — SECURITY_SPEC §5. `.strict()` rejects unknown
 * keys; `website` is a honeypot that must stay empty; `turnstile` is verified
 * server-side when Turnstile is configured. Mirrors the registration schema.
 */
export const ContactSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().toLowerCase().email().max(120),
    subject: z.string().trim().max(140).optional().default(""),
    message: z.string().trim().min(10).max(4000),
    website: z.string().max(0, "bot").optional().default(""), // honeypot
    turnstile: z.string().optional(),
  })
  .strict();

export type ContactInput = z.infer<typeof ContactSchema>;
