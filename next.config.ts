import type { NextConfig } from "next";

/**
 * Security headers — SECURITY_SPEC.md §2 (transport & browser hardening).
 *
 * These are the static headers safe to set globally in Phase 0. The strict,
 * per-request nonce-based Content-Security-Policy (script-src 'nonce-…'
 * 'strict-dynamic') requires generating a nonce in middleware and threading it
 * into the document — that lands in Phase 1 alongside the admin surface. Until
 * then we deliberately do NOT ship a weak CSP with 'unsafe-inline', which would
 * give a false sense of protection.
 */
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    // camera=(self) is deliberate — the kiosk QR scanner needs it (SPEC §2).
    value: "camera=(self), microphone=(), geolocation=(), payment=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // Pin the workspace root — a stray package-lock.json in the parent (home) dir
  // otherwise makes Turbopack infer the wrong root.
  turbopack: { root: import.meta.dirname },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
