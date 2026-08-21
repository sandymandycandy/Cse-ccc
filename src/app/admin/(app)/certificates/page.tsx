import { requireViewPage } from "@/lib/auth/guards";

// Reserved slot (BUILD_PLAN §12.6). Issuing is intentionally deferred until the
// council logos + faculty advisor signature are provided, and until attendance
// (§13.8) supplies the "who attended" data it draws from. The route + capability
// gate exist now so it drops in without restructuring the admin.
export default async function CertificatesPage() {
  await requireViewPage("issue:participation_certificate");

  return (
    <div className="admin-page" style={{ maxWidth: 640 }}>
      <div className="eyebrow">Certificates</div>
      <h1 style={{ margin: "6px 0 0" }}>Certificates</h1>
      <div className="note" style={{ marginTop: 16 }}>
        Issuing is on hold until two things land: the council/department logos and
        the faculty advisor&rsquo;s signature image (for the PDF), and attendance
        capture (being built next), which decides who gets a participation
        certificate. The button lives here when it&rsquo;s ready.
      </div>
    </div>
  );
}
