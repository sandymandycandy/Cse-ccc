"use server";

import { z } from "zod";
import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import { findMemberForLogin, verifyMemberLogin, recordLoginFailure, resetLoginFailures } from "@/lib/member/auth";
import { checkLoginLimits } from "@/lib/rate-limit";
import { makeMemberSession, MEMBER_COOKIE } from "@/lib/member/session";
import type { MemberLoginState } from "@/lib/admin/form-state";

const Schema = z.object({
  email: z.string().trim().email(),
  pin: z.string().regex(/^\d{6}$/),
  totp: z.string().trim().min(1),
});

const GENERIC = "Wrong email, PIN, or code.";
const useSecure = process.env.NODE_ENV === "production";

export async function memberLoginAction(
  _prev: MemberLoginState,
  formData: FormData,
): Promise<MemberLoginState> {
  const parsed = Schema.safeParse({
    email: formData.get("email"), pin: formData.get("pin"), totp: formData.get("totp"),
  });
  if (!parsed.success) return { error: GENERIC };
  const { email, pin, totp } = parsed.data;

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkLoginLimits({ ip, email }).ok) return { error: GENERIC };

  const row = await findMemberForLogin(email);
  if (!row) return { error: GENERIC };

  if (await verifyMemberLogin(row, pin, totp)) {
    await resetLoginFailures(row.memberId);
    (await cookies()).set({
      name: MEMBER_COOKIE,
      value: makeMemberSession({ memberId: row.memberId, clubId: row.clubId, epoch: row.sessionEpoch }),
      httpOnly: true, sameSite: "lax", path: "/", secure: useSecure, maxAge: 30 * 24 * 60 * 60,
    });
    redirect("/member");
  }

  // Only count a failure when the account exists + isn't already locked, mirroring
  // the admin generic-failure contract.
  await recordLoginFailure(row.memberId, row.failedAttempts);
  return { error: GENERIC };
}
