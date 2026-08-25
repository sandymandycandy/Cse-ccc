import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { MEMBER_COOKIE, readMemberSession } from "./session";

export interface MemberSession {
  memberId: string;
  clubId: string;
  name: string;
  email: string;
}

/** Authoritative member check: cookie signature + DB epoch + still-active + activated. */
export const getMemberSession = cache(async function (): Promise<MemberSession | null> {
  const raw = (await cookies()).get(MEMBER_COOKIE)?.value;
  const payload = readMemberSession(raw);
  if (!payload) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("club_members")
    .select("id, name, email, club_id, is_active, club_member_auth(session_epoch, activated_at)")
    .eq("id", payload.memberId)
    .maybeSingle();
  if (!data || !data.is_active) return null;
  const a = data.club_member_auth as unknown as { session_epoch: number; activated_at: string | null } | null;
  if (!a || !a.activated_at || a.session_epoch !== payload.epoch) return null;

  return { memberId: data.id, clubId: data.club_id, name: data.name, email: data.email ?? "" };
});

export async function requireMember(): Promise<MemberSession> {
  const s = await getMemberSession();
  if (!s) redirect("/member/login");
  return s;
}
