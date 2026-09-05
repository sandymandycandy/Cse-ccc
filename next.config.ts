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

/**
 * Storage images are served from the Supabase project, so next/image needs that
 * host allow-listed. Derived from the env var rather than hardcoded: the project
 * ref changed once already (Seoul -> Mumbai, 2026-09-05), and a literal hostname
 * here would have silently broken every image on the site the moment it moved.
 */
const supabaseHostname = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname || null;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  // Pin the workspace root — a stray package-lock.json in the parent (home) dir
  // otherwise makes Turbopack infer the wrong root.
  turbopack: { root: import.meta.dirname },
  images: {
    // AVIF first, WebP second: both are far smaller than the source JPEG/WebP
    // originals, and Next falls back automatically for browsers that lack them.
    formats: ["image/avif", "image/webp"],
    remotePatterns: supabaseHostname
      ? [
          {
            protocol: "https",
            hostname: supabaseHostname,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
