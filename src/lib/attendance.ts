import "server-only";
import { createHmac, randomBytes, createHash, timingSafeEqual } from "node:crypto";

/**
 * Rotating-broadcast attendance (SECURITY_SPEC §8a). The organiser displays one
 * QR that rotates every ROTATE_SECONDS; a present student scans it from their own
 * enrolled phone inside the session window. The code is an HMAC of the session id
 * and the time slot, so a screenshot forwarded to an absent friend is stale
 * before it arrives.
 */

const ROTATE_SECONDS = 5;
const SLOT_TOLERANCE = 1; // accept the current + previous slot → ~10s TTL

/** Device cookie name — __Host- prefixed + Secure in production. */
export const DEVICE_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-ccc.device" : "ccc.device";

function hmacSecret(): string {
  const s = process.env.ATTENDANCE_HMAC_SECRET;
  if (!s) throw new Error("ATTENDANCE_HMAC_SECRET is not set.");
  return s;
}

function slotCode(sessionId: string, slot: number): string {
  return createHmac("sha256", hmacSecret())
    .update(`${sessionId}|${slot}`)
    .digest("base64url")
    .slice(0, 16); // short enough for a dense QR, 96 bits of the digest
}

/** The code to display right now for `sessionId`. */
export function currentCode(sessionId: string, nowMs: number = Date.now()): string {
  return slotCode(sessionId, Math.floor(nowMs / 1000 / ROTATE_SECONDS));
}

/**
 * True when `code` matches the current or previous slot for `sessionId`. Compared
 * in constant time; a forwarded, now-stale code fails.
 */
export function verifyCode(
  sessionId: string,
  code: string,
  nowMs: number = Date.now(),
): boolean {
  if (!code || code.length !== 16) return false;
  const slot = Math.floor(nowMs / 1000 / ROTATE_SECONDS);
  const given = Buffer.from(code);
  for (let d = 0; d <= SLOT_TOLERANCE; d++) {
    const expected = Buffer.from(slotCode(sessionId, slot - d));
    if (expected.length === given.length && timingSafeEqual(expected, given)) return true;
  }
  return false;
}

// ── device credentials ───────────────────────────────────────────────────────

/** A fresh opaque device id to store (httpOnly) in the student's cookie. */
export function newDeviceId(): string {
  return randomBytes(32).toString("base64url");
}

/** What we persist in student_devices.device_hash — never the raw id. */
export function deviceHash(deviceId: string): string {
  return createHash("sha256").update(deviceId).digest("hex");
}

// ── session window ───────────────────────────────────────────────────────────

export interface SessionWindow {
  status: string;
  opened_at: string;
  window_seconds: number;
  closed_at: string | null;
}

/** A session accepts scans only while open and inside its window. */
export function isSessionOpen(s: SessionWindow, nowMs: number = Date.now()): boolean {
  if (s.status !== "open" || s.closed_at) return false;
  return nowMs < new Date(s.opened_at).getTime() + s.window_seconds * 1000;
}

/** Seconds left in the session window (0 once closed/elapsed). */
export function secondsLeft(s: SessionWindow, nowMs: number = Date.now()): number {
  const end = new Date(s.opened_at).getTime() + s.window_seconds * 1000;
  return Math.max(0, Math.ceil((end - nowMs) / 1000));
}

// ── member QR token (static, head-scanned) ───────────────────────────────────
// A member's QR encodes `<memberId>.<sig>`; the same token both marks the member
// present (a head scans it) and authorises their read-only self-view. Static
// (no time slot): the head's authenticated session is the trust anchor.

function memberSig(memberId: string): string {
  return createHmac("sha256", hmacSecret())
    .update(`member:v1|${memberId}`)
    .digest("base64url");
}

/** The token to embed in a member's QR. */
export function memberToken(memberId: string): string {
  return `${memberId}.${memberSig(memberId)}`;
}

/** The member id if `token` carries a valid signature (constant-time), else null. */
export function verifyMemberToken(token: string): string | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [memberId, sig] = parts;
  if (!memberId || !sig) return null;
  const expected = Buffer.from(memberSig(memberId));
  const given = Buffer.from(sig);
  if (expected.length !== given.length) return null;
  return timingSafeEqual(expected, given) ? memberId : null;
}

// ── time-boxed member QR (anti-proxy portal display, spec §6a) ────────────────
// The portal shows a QR that expires after a head-set window; a screenshot is stale
// once `exp` passes. Distinguished from the static token by an `e.` prefix.

function memberExpSig(memberId: string, exp: number): string {
  return createHmac("sha256", hmacSecret())
    .update(`member-exp:v1|${memberId}|${exp}`)
    .digest("base64url");
}

/** A member token that is valid only until `now + ttlSeconds`. */
export function memberExpiringToken(
  memberId: string,
  ttlSeconds: number,
  nowMs: number = Date.now(),
): string {
  const exp = nowMs + Math.max(1, Math.floor(ttlSeconds)) * 1000;
  return `e.${memberId}.${exp}.${memberExpSig(memberId, exp)}`;
}

/** The member id iff the signature is valid AND the token has not expired. */
export function verifyMemberExpiringToken(
  token: string,
  nowMs: number = Date.now(),
): string | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "e") return null;
  const [, memberId, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!memberId || !sig || !Number.isInteger(exp)) return null;
  const expected = Buffer.from(memberExpSig(memberId, exp));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return nowMs <= exp ? memberId : null;
}
