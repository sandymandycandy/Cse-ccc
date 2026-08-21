import "server-only";
import {
  randomInt,
  createHash,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import * as OTPAuth from "otpauth";

/**
 * Admin second factor — SECURITY_SPEC §3. RFC 6238 TOTP plus single-use recovery
 * codes. The shared secret is stored encrypted at rest (AES-256-GCM under
 * TOTP_ENC_KEY); recovery codes are stored only as SHA-256 hashes (they are
 * high-entropy, so a slow hash buys nothing).
 */

const ISSUER = "CSE Club Council";
const RECOVERY_CODE_COUNT = 10;
// Crockford-ish alphabet: no 0/O/1/I to keep hand-typed codes unambiguous.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function buildTotp(secretBase32: string, email: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

/** A fresh 160-bit TOTP secret, base32-encoded. */
export function newTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

/** The `otpauth://` URI to render as a QR during enrollment. */
export function totpKeyUri(secretBase32: string, email: string): string {
  return buildTotp(secretBase32, email).toString();
}

/** Verify a 6-digit code, tolerating ±1 step (30s) of clock drift. */
export function verifyTotp(secretBase32: string, token: string): boolean {
  const clean = token.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  return buildTotp(secretBase32, "").validate({ token: clean, window: 1 }) !== null;
}

// ── recovery codes ───────────────────────────────────────────────────────────

/** Ten formatted single-use codes (`XXXXX-XXXXX`) to show the admin once. */
export function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    let s = "";
    for (let i = 0; i < 10; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

const normalizeCode = (code: string) =>
  code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

/** SHA-256 of the normalised code — what we persist in recovery_codes_hashed. */
export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normalizeCode(code)).digest("hex");
}

/**
 * Index of the stored hash matching `input`, or -1. Compared in constant time so
 * a match doesn't leak through timing. The caller must then remove that hash
 * (single-use).
 */
export function matchRecoveryCode(input: string, hashed: string[]): number {
  const target = Buffer.from(hashRecoveryCode(input), "hex");
  for (let i = 0; i < hashed.length; i++) {
    const candidate = Buffer.from(hashed[i], "hex");
    if (candidate.length === target.length && timingSafeEqual(candidate, target)) {
      return i;
    }
  }
  return -1;
}

// ── secret encryption at rest (AES-256-GCM) ──────────────────────────────────

function totpKey(): Buffer {
  const raw = process.env.TOTP_ENC_KEY;
  if (!raw) throw new Error("TOTP_ENC_KEY is not set (32-byte base64 key required).");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("TOTP_ENC_KEY must decode to exactly 32 bytes (base64).");
  }
  return key;
}

/** Encrypt a base32 secret → "iv.tag.ciphertext" (all base64) for storage. */
export function encryptSecret(secretBase32: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", totpKey(), iv);
  const ct = Buffer.concat([cipher.update(secretBase32, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ct].map((b) => b.toString("base64")).join(".");
}

/** Inverse of {@link encryptSecret}; throws if the ciphertext was tampered. */
export function decryptSecret(encrypted: string): string {
  const [ivB64, tagB64, ctB64] = encrypted.split(".");
  if (!ivB64 || !tagB64 || !ctB64) throw new Error("Malformed encrypted secret.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    totpKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
