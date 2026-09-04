import { requireViewPage } from "@/lib/auth/guards";
import { todayKey } from "@/lib/datetime";
import { getClubVitalityData } from "@/lib/admin/club-vitality-data";
import { computeClubVitality, WINDOW_DAYS } from "@/lib/admin/club-vitality";
import { ClubHealth } from "@/components/admin/ClubHealth";

/**
 * Council-only club health (design D1/D2).
 *
 * ⚠️ THE GATE IS `manage:council`, NEVER `view:analytics`. Club heads and vice
 * heads hold `view:analytics` at `own`, and events/social heads hold it at
 * `all` — gating on it would hand a cross-club ranking to nine roles. This page
 * is deliberately visible only to the four council roles.
 *
 * It is also deliberately not grafted onto `/admin/attendance` (gated on
 * `manage:members`, which club heads hold): a second, inner capability check
 * inside a page that already has one is how leaks start.
 *
 * `nowKey` is resolved once here and threaded through both the read and the
 * computation, so the window the marks were fetched for is exactly the window
 * the rates are computed over.
 */
export default async function ClubHealthPage() {
  await requireViewPage("manage:council");

  const nowKey = todayKey();
  const rows = computeClubVitality(await getClubVitalityData(nowKey), nowKey);

  return (
    <div className="admin-page">
      <div className="eyebrow">Oversight</div>
      <h1 style={{ margin: "6px 0 0" }}>Club health</h1>
      <p className="lead" style={{ marginTop: 8 }}>
        Clubs that need a conversation, most pressing first — then everyone else,
        for when you want to check. Everything covers the last {WINDOW_DAYS} days.
      </p>
      <ClubHealth rows={rows} windowDays={WINDOW_DAYS} />
    </div>
  );
}
