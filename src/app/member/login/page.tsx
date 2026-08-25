import type { Metadata } from "next";
import { MemberLoginForm } from "@/components/member/MemberLoginForm";

export const metadata: Metadata = { title: "Member sign in", robots: { index: false } };

export default function MemberLoginPage() {
  return (
    <main className="admin-auth">
      <div className="admin-auth-card" style={{ maxWidth: 400 }}>
        <MemberLoginForm />
      </div>
    </main>
  );
}
