import { notFound } from "next/navigation";
import { getClubByJoinToken } from "@/lib/admin/clubs";
import { SelfRegisterForm } from "@/components/roster/SelfRegisterForm";

export const metadata = { robots: { index: false } };

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const club = await getClubByJoinToken(token);
  if (!club) notFound();
  return (
    <main className="container" style={{ maxWidth: 560, padding: "48px 20px" }}>
      <div className="eyebrow">{club.name}</div>
      <h1 style={{ margin: "6px 0 8px" }}>Join the roster</h1>
      <p className="lead" style={{ marginBottom: 20 }}>
        Fill in your details. Your club head will approve you, after which you can check your attendance any time by roll number.
      </p>
      <SelfRegisterForm token={token} />
    </main>
  );
}
