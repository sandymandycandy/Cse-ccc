"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MEMBER_COOKIE } from "@/lib/member/session";

const useSecure = process.env.NODE_ENV === "production";

export async function memberLogoutAction(): Promise<void> {
  (await cookies()).set({
    name: MEMBER_COOKIE, value: "", httpOnly: true, sameSite: "lax",
    path: "/", secure: useSecure, maxAge: 0,
  });
  redirect("/member/login");
}
