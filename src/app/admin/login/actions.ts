"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { LoginSchema } from "@/lib/validation/admin";
import { peekLoginLimits } from "@/lib/rate-limit";
import { lockoutMessage } from "@/lib/auth/lockout";
import type { LoginState } from "@/lib/admin/form-state";

/**
 * Admin login (SECURITY_SPEC §3). Credential verification, rate limiting (§6)
 * and 2FA all happen inside the Credentials `authorize` — a direct POST to the
 * endpoint is protected too, and `authorize` stays the only place that spends
 * an attempt.
 *
 * Wrong email, wrong password and wrong TOTP all surface the SAME generic
 * message, so none of them can be told apart. The lockout is the one exception,
 * and it leaks nothing: the limiter runs before the `admin_users` lookup and
 * counts a made-up address exactly like a real one.
 */
export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    totp: formData.get("totp") || undefined,
    recoveryCode: formData.get("recoveryCode") || undefined,
  });
  if (!parsed.success) return { error: "Enter your email and password." };

  // Key on the SCHEMA-NORMALISED email: LoginSchema trims and lowercases, and
  // `authorize` keys the limiter on that value. Peeking with the raw field
  // would consult a different bucket than the one being filled.
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const id = { ip, email: parsed.data.email };

  // Read-only — peeking must not spend an attempt, or three chances become two.
  const before = peekLoginLimits(id);
  if (!before.ok) {
    return {
      error: lockoutMessage(before.retryAfterSeconds),
      retryAfterSeconds: before.retryAfterSeconds,
    };
  }

  try {
    await signIn("credentials", { ...parsed.data, redirectTo: "/admin" });
  } catch (err) {
    // Credential failures → generic message; the redirect "error" thrown on
    // success and any other control-flow signal must propagate untouched.
    if (err instanceof AuthError) {
      // `authorize` just spent this attempt. If it was the last one, say so now
      // instead of making them submit again to discover they are locked.
      const after = peekLoginLimits(id);
      if (!after.ok) {
        return {
          error: lockoutMessage(after.retryAfterSeconds),
          retryAfterSeconds: after.retryAfterSeconds,
        };
      }
      return { error: "Wrong email, password, or code." };
    }
    throw err;
  }
  return {};
}
