import { z } from "zod";

/**
 * Admin login input (SECURITY_SPEC §3). Password + a second factor: either a
 * 6-digit TOTP or a recovery code. Both second-factor fields are optional here
 * because an admin who hasn't enrolled TOTP yet submits neither; `authorize`
 * enforces the requirement per-account.
 */
export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(120),
  password: z.string().min(1).max(200),
  totp: z.string().trim().optional(),
  recoveryCode: z.string().trim().optional(),
});

export type LoginInput = z.infer<typeof LoginSchema>;
