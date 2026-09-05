import { z } from "zod";

/**
 * Public feedback-form input. `.strict()` rejects unknown keys; `website` is a
 * honeypot that must stay empty; `turnstile` is verified server-side when
 * configured. Mirrors ContactSchema.
 *
 * The two leader ratings and every comment are OPTIONAL and independent: a
 * comment may be left with no rating and a rating with no comment. Forcing a
 * number out of someone with no opinion of a person produces a noisy average.
 * `clubRating` and `activities` are the only substantive required fields.
 */
export const FeedbackSchema = z
  .object({
    vtu: z
      .string()
      .trim()
      .min(3, "Enter your VTU number.")
      .max(20, "That VTU number is too long."),
    studentName: z
      .string()
      .trim()
      .min(2, "Please enter your name (at least 2 characters).")
      .max(80, "Name is too long (max 80 characters)."),
    clubId: z.string().uuid("Choose your club."),

    headRating: z.number().int().min(1).max(5).nullable().optional().default(null),
    headComment: z
      .string()
      .trim()
      .max(2000, "Too long (max 2000 characters).")
      .optional()
      .default(""),
    viceRating: z.number().int().min(1).max(5).nullable().optional().default(null),
    viceComment: z
      .string()
      .trim()
      .max(2000, "Too long (max 2000 characters).")
      .optional()
      .default(""),

    // Council-wide social media: the team's output and the head as a person.
    // Both optional and independent, like the club leader blocks.
    socialTeamRating: z.number().int().min(1).max(5).nullable().optional().default(null),
    socialTeamComment: z
      .string()
      .trim()
      .max(2000, "Too long (max 2000 characters).")
      .optional()
      .default(""),
    socialLeadRating: z.number().int().min(1).max(5).nullable().optional().default(null),
    socialLeadComment: z
      .string()
      .trim()
      .max(2000, "Too long (max 2000 characters).")
      .optional()
      .default(""),

    clubRating: z.number().int().min(1, "Rate the club.").max(5),
    activities: z
      .string()
      .trim()
      .min(5, "Please write at least 5 characters.")
      .max(4000, "Too long (max 4000 characters)."),
    suggestions: z
      .string()
      .trim()
      .max(4000, "Too long (max 4000 characters).")
      .optional()
      .default(""),

    website: z.string().max(0, "bot").optional().default(""), // honeypot
    turnstile: z.string().optional(),
  })
  .strict();

export type FeedbackInput = z.infer<typeof FeedbackSchema>;

/** Fields whose validation messages may be shown to the student. Never includes
 *  the honeypot or the bot token — a filled honeypot must fail generically. */
export const FEEDBACK_FIELD_KEYS = [
  "vtu",
  "studentName",
  "clubId",
  "headRating",
  "headComment",
  "viceRating",
  "viceComment",
  "clubRating",
  "activities",
  "suggestions",
  "socialTeamRating",
  "socialTeamComment",
  "socialLeadRating",
  "socialLeadComment",
] as const;
