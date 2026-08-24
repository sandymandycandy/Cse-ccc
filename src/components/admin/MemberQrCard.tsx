import { memberToken } from "@/lib/attendance";
import { qrDataUrl } from "@/lib/qr";

/** A printable QR card for a member. The QR encodes the member self-view URL,
 *  which also carries the token a head's scanner reads. */
export async function MemberQrCard({ memberId, name }: { memberId: string; name: string }) {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const url = `${base}/m/${memberToken(memberId)}`;
  const dataUrl = await qrDataUrl(url);
  return (
    <div style={{ display: "inline-block", textAlign: "center", padding: 16, border: "1px solid var(--rule)", borderRadius: 8 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dataUrl} alt={`QR code for ${name}`} width={200} height={200} style={{ width: 200, height: 200 }} />
      <div className="label" style={{ marginTop: 8 }}>{name}</div>
    </div>
  );
}
