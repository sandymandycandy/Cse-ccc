import "server-only";
import { createHash, randomBytes } from "node:crypto";

/**
 * One-tap confirmation token (BUILD_PLAN §12.4). A 32-byte random token is
 * emailed to the student; only its SHA-256 hash is stored, so the DB never holds
 * anything that can confirm a seat on its own.
 */
export function generateConfirmToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
