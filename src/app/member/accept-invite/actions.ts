"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validateMemberInvite, consumeMemberInvite } from "@/lib/member/invites";
import { commitSetup } from "@/lib/member/auth";
import { verifyTotp, decryptSecret } from "@/lib/auth/totp";
import { makeMemberSession, MEMBER_COOKIE } from "@/lib/member/session";
import { writeAudit } from "@/lib/admin/audit";
import type { MemberSetupState } from "@/lib/admin/form-state";

const Schema = z.object({
  token: z.string().min(1),
  pin: z.string().regex(/^\d{6}$/, "Your PIN must be 6 digits."),
  totp: z.string().trim().min(1),
  secret: z.string().min(1),
});

const useSecure = process.env.NODE_ENV === "production";

export async function memberSetupAction(
  _prev: MemberSetupState,
  formData: FormData,
): Promise<MemberSetupState> {
  const parsed = Schema.safeParse({
    token: formData.get("token"), pin: formData.get("pin"),
    totp: formData.get("totp"), secret: formData.get("secret"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const { token, pin, totp, secret: encSecret } = parsed.data;

  const invite = await validateMemberInvite(token);
  if (!invite) return { error: "This link is invalid or has expired. Ask for a new one." };

  let secret: string;
  try { secret = decryptSecret(encSecret); } catch { return { error: "Enrollment expired — reload and scan again." }; }
  if (!verifyTotp(secret, totp)) return { error: "That authenticator code didn't match. Use the current one." };

  await commitSetup({ memberId: invite.memberId, pin, encSecret });
  const consumed = await consumeMemberInvite(invite.id);
  if (!consumed) return { error: "This link was already used. Ask for a new one." };

  await writeAudit({ actorId: invite.memberId, action: "setup", entity: "club_member", entityId: invite.memberId });

  (await cookies()).set({
    name: MEMBER_COOKIE,
    value: makeMemberSession({ memberId: invite.memberId, clubId: invite.clubId, epoch: 0 }),
    httpOnly: true, sameSite: "lax", path: "/", secure: useSecure, maxAge: 30 * 24 * 60 * 60,
  });
  redirect("/member");
}
