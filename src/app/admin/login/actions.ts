"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { LoginSchema } from "@/lib/validation/admin";
import { checkLoginLimits } from "@/lib/rate-limit";
import type { LoginState } from "@/lib/admin/form-state";

/**
 * Admin login (SECURITY_SPEC §3). Rate-limited per IP and per account before the
 * credential check; every failure returns the *same* generic message so wrong
 * email, wrong password, and locked account are indistinguishable. On success,
 * signIn issues the session cookie and redirects to /admin.
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

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkLoginLimits({ ip, email: parsed.data.email }).ok) {
    return { error: "Too many attempts. Try again in a few minutes." };
  }

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
