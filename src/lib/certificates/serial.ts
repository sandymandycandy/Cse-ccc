import "server-only";
import { createHmac, randomBytes } from "node:crypto";

/** A unique, human-legible certificate serial, e.g. "CSE-2026-9F3AC1B2". The
 *  `certificates.serial` column is UNIQUE — the caller retries on the rare clash. */
export function newCertificateSerial(): string {
  const year = new Date().getFullYear();
  return `CSE-${year}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

/** Tamper-evident stamp over the serial (domain-separated), stored in
 *  `certificates.hmac` so a future public verifier can recompute + constant-time
 *  compare. Uses the app signing secret. */
export function certificateHmac(serial: string): string {
  const secret = process.env.NEXTAUTH_SECRET ?? "";
  return createHmac("sha256", secret).update(`cert:v1|${serial}`).digest("hex");
}
