import "server-only";
import { z } from "zod";

/**
 * Server-side environment validation — BUILD_PLAN §15, SECURITY_SPEC §3.
 *
 * This module throws at load time if a required variable is missing or malformed.
 * There are deliberately NO insecure fallbacks (`|| 'dev-secret'`): a missing
 * secret must fail loudly, never silently degrade to a guessable value.
 *
 * `import "server-only"` guarantees this never reaches the client bundle, so the
 * service-role key and HMAC secrets cannot leak. Client code must read the
 * NEXT_PUBLIC_* values from process.env directly (they are inlined at build).
 *
 * Not yet imported by Phase 0 runtime code (the home page needs none of these),
 * so local dev works before credentials exist. The moment a feature imports
 * `env`, missing secrets surface immediately.
 */

const secret = z
  .string()
  .min(32, "must be at least 32 bytes (see .env.example for how to generate)");

const schema = z.object({
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // App / sessions
  NEXT_PUBLIC_SITE_URL: z.string().url(),
  NEXTAUTH_URL: z.string().url().optional(),
  NEXTAUTH_SECRET: secret,

  // Crypto secrets — each distinct (enforced below)
  CHECKIN_HMAC_SECRET: secret,
  ATTENDANCE_HMAC_SECRET: secret,
  CERT_HMAC_SECRET: secret,
  INVITE_HMAC_SECRET: secret,
  PREFS_HMAC_SECRET: secret,
  CRON_SECRET: secret,

  // Email
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(1),

  // Rate limiting — optional locally (in-memory fallback, SECURITY_SPEC §6)
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),

  // Bot protection
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1),
  TURNSTILE_SECRET_KEY: z.string().min(1),

  // Monitoring — optional
  SENTRY_DSN: z.string().url().optional(),
});

/** The crypto secrets that must never share a value (BUILD_PLAN §15). */
const DISTINCT_SECRET_KEYS = [
  "NEXTAUTH_SECRET",
  "CHECKIN_HMAC_SECRET",
  "ATTENDANCE_HMAC_SECRET",
  "CERT_HMAC_SECRET",
  "INVITE_HMAC_SECRET",
  "PREFS_HMAC_SECRET",
  "CRON_SECRET",
] as const;

const refined = schema.superRefine((val, ctx) => {
  const seen = new Map<string, string>();
  for (const key of DISTINCT_SECRET_KEYS) {
    const value = val[key];
    const prior = seen.get(value);
    if (prior) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `must be distinct from ${prior} — reusing a secret enables cross-system token replay`,
      });
    } else {
      seen.set(value, key);
    }
  }
});

function loadEnv() {
  const parsed = refined.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration (see .env.example):\n${details}`,
    );
  }
  return parsed.data;
}

export type Env = z.infer<typeof schema>;
export const env: Env = loadEnv();
