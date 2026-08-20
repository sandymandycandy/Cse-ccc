import type { Metadata } from "next";
import { getClubsWithCounts } from "@/lib/queries";
import { ClubsDirectory } from "@/components/ClubsDirectory";

export const metadata: Metadata = {
  title: "Clubs",
  description: "The department's eleven clubs across tech, media, cultural, wellness and career.",
};

export default async function ClubsPage() {
  const clubs = await getClubsWithCounts();

  return (
    <section className="section" style={{ paddingTop: 56 }}>
      <div className="eyebrow">Directory</div>
      <h1 style={{ margin: "12px 0 0" }}>The clubs</h1>
      <p className="lead" style={{ marginTop: 16, maxWidth: 560 }}>
        Eleven clubs across tech, media, cultural, wellness and career. Pick a
        lane — each one runs its own events, and you can join up to three.
      </p>
      <div style={{ marginTop: 32 }}>
        <ClubsDirectory clubs={clubs} />
      </div>
    </section>
  );
}
