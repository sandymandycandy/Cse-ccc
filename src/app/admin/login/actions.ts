"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { LoginSchema } from "@/lib/validation/admin";
import type { LoginState } from "@/lib/admin/form-state";

/**
 * Admin login (SECURITY_SPEC §3). Credential verification, rate limiting (§6),
 * and 2FA all happen inside the Credentials `authorize` (so a direct POST to the
 * endpoint is protected too); every failure surfaces the *same* generic message
 * so wrong email, wrong password, rate-limited, and locked are indistinguishable.
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

  try {
    await signIn("credentials", { ...parsed.data, redirectTo: "/admin" });
  } catch (err) {
    // Credential failures → generic message; the redirect "error" on success and
    // any other control-flow signal must propagate untouched.
    if (err instanceof AuthError) {
      return { error: "Wrong email, password, or code." };
    }
    throw err;
  }
  return {};
}
