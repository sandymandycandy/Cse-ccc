import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Member session cookie value (spec §5.5). A compact signed token —
 * `base64url(JSON{memberId,clubId,epoch,exp}).hmac` — mirroring the idle.ts HMAC
 * pattern, but domain-separated with a prefix so it can NEVER be confused with the
 * admin next-auth session. Members do not use Auth.js.
 */

export const MEMBER_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-ccc.member" : "ccc.member";

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days (spec §5.5)
const DOMAIN = "member-session:v1|";

export interface MemberSessionPayload {
  memberId: string;
  clubId: string;
  epoch: number;
}

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET is not set.");
  return s;
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(DOMAIN + body).digest("base64url");
}

export function makeMemberSession(
  payload: MemberSessionPayload,
  now: number = Date.now(),
  ttlMs: number = DEFAULT_TTL_MS,
): string {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: now + ttlMs }),
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function readMemberSession(
  raw: string | undefined | null,
  now: number = Date.now(),
): MemberSessionPayload | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = raw.slice(0, dot);
  const provided = Buffer.from(raw.slice(dot + 1));
  const expected = Buffer.from(sign(body));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }
  try {
    const d = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof d.exp !== "number" || d.exp < now) return null;
    if (typeof d.memberId !== "string" || typeof d.clubId !== "string" || typeof d.epoch !== "number") {
      return null;
    }
    return { memberId: d.memberId, clubId: d.clubId, epoch: d.epoch };
  } catch {
    return null;
  }
}
