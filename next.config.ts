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
  // ⚠️ Every admin image upload posts through a Server Action, and Next caps a
  // Server Action body at 1 MB BY DEFAULT — before any of our code runs. That
  // default silently broke every upload over 1 MB across the whole admin
  // (gallery, announcements, achievements, event posters, team portraits):
  // the forms offered 5 MB and 2 MB, Next answered 413 with an opaque
  // "This page couldn't load", and handleImageUpload's friendly size message
  // was never reached.
  //
  // This must stay ABOVE the largest cap we enforce ourselves (MAX_IMAGE, 5 MB)
  // plus room for the rest of the form, so OUR check is the one that fires and
  // the person gets a real message. Pinned by src/lib/admin/upload-limits.test.ts.
  //
  // Certificate assets are unaffected either way — they upload straight to
  // Storage through a signed URL, not through a Server Action.
  experimental: {
    serverActions: { bodySizeLimit: "6mb" },
  },
  // The certificate renderer reads the bundled TTFs from disk (font-files.ts).
  // They live in public/, which is not part of a function's trace by default.
  outputFileTracingIncludes: {
    "/admin/**/certificates": ["./public/fonts/cert/*.ttf"],
    "/api/admin/events/**": ["./public/fonts/cert/*.ttf"],
    "/api/admin/certificates/**": ["./public/fonts/cert/*.ttf"],
  },
  images: {
    // AVIF first, WebP second: both are far smaller than the source JPEG/WebP
    // originals, and Next falls back automatically for browsers that lack them.
    formats: ["image/avif", "image/webp"],
    // 90 is for the team-page portraits, which are large and faces-first —
    // 75 visibly softens them. Everything else stays on the 75 default.
    qualities: [75, 90],
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
