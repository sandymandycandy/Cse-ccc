import { istLocalToUTC } from "@/lib/datetime";

type Ok = { ok: true; opensAt: string | null; closesAt: string | null };
type Err = { ok: false; error: string };

/** Validate + convert the two IST datetime-local schedule inputs to UTC ISO (or null). */
export function parseSchedule(
  opensLocal: string,
  closesLocal: string,
  startsAtUTC: string,
): Ok | Err {
  const opensAt = opensLocal ? istLocalToUTC(opensLocal) : null;
  const closesAt = closesLocal ? istLocalToUTC(closesLocal) : null;
  if (opensLocal && !opensAt) return { ok: false, error: "Enter a valid registration open time." };
  if (closesLocal && !closesAt) return { ok: false, error: "Enter a valid registration close time." };
  if (opensAt && closesAt && new Date(opensAt) > new Date(closesAt)) {
    return { ok: false, error: "Registration must open before it closes." };
  }
  if (opensAt && new Date(opensAt) > new Date(startsAtUTC)) {
    return { ok: false, error: "Registration should open before the event starts." };
  }
  return { ok: true, opensAt, closesAt };
}
