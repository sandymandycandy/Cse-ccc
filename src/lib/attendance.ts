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
