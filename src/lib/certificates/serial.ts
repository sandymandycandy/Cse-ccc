import "server-only";
import { createHmac, randomBytes } from "node:crypto";

/** Crockford base32: no I, L, O or U, so a serial read aloud or retyped survives. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** 128 bits need 26 × 5 = 130 bits of room. */
const SYMBOLS = 26;

/** A current serial: CSE-2026-XXXXX-XXXXX-XXXXX-XXXXX-XXXXXX. */
export const SERIAL_RE = /^CSE-\d{4}-[0-9A-HJKMNP-TV-Z]{5}(?:-[0-9A-HJKMNP-TV-Z]{5}){3}-[0-9A-HJKMNP-TV-Z]{6}$/;
/** Serials issued before 2026-09-14: CSE-2026-9F3AC1B2 (32 bits). They stay valid. */
const LEGACY_BODY = /^[0-9A-F]{8}$/;

/** 16 bytes → 26 Crockford symbols, most significant first. */
export function encodeCrockford(bytes: Uint8Array): string {
  // Two leading zero bits pad 128 bits to 130, a whole number of 5-bit symbols.
  let bits = 2;
  let acc = 0;
  let out = "";
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(acc >> bits) & 31];
    }
    acc &= (1 << bits) - 1;
  }
  return out;
}

const group = (body: string) =>
  [body.slice(0, 5), body.slice(5, 10), body.slice(10, 15), body.slice(15, 20), body.slice(20)].join("-");

const istYear = (now: Date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric" }).format(now);

/**
 * A certificate serial carrying 128 random bits (SECURITY_SPEC §9), e.g.
 * "CSE-2026-3KQ9D-…". That is what lets `/verify/<serial>` answer anyone who
 * holds the serial: it cannot be guessed or enumerated. The `certificates.serial`
 * column is UNIQUE — the caller retries on the (astronomically rare) clash.
 */
export function newCertificateSerial(
  random: (n: number) => Uint8Array = (n) => randomBytes(n),
  now: Date = new Date(),
): string {
  return `CSE-${istYear(now)}-${group(encodeCrockford(random(16)))}`;
}

/**
 * What someone typed, as the serial is stored — or null if it cannot be one.
 * Forgives case, spaces, missing dashes and Crockford's look-alikes (O→0,
 * I/L→1). Accepts both the current format and the older 8-hex-digit serials.
 */
export function normalizeSerial(input: string): string | null {
  if (input.length > 80) return null;
  const compact = input.toUpperCase().replace(/[\s-]+/g, "");
  const m = /^CSE(\d{4})([0-9A-Z]+)$/.exec(compact);
  if (!m) return null;
  const body = m[2].replace(/O/g, "0").replace(/[IL]/g, "1");
  if (LEGACY_BODY.test(body)) return `CSE-${m[1]}-${body}`;
  if (body.length !== SYMBOLS || /[^0-9A-HJKMNP-TV-Z]/.test(body)) return null;
  return `CSE-${m[1]}-${group(body)}`;
}

/** Tamper-evident stamp over the serial (domain-separated), stored in
 *  `certificates.hmac`. Verification does not depend on it (spec §7), so
 *  rotating the app secret cannot invalidate a certificate. */
export function certificateHmac(serial: string): string {
  const secret = process.env.NEXTAUTH_SECRET ?? "";
  return createHmac("sha256", secret).update(`cert:v1|${serial}`).digest("hex");
}
