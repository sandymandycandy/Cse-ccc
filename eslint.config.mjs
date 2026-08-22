import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import adminRouteRequiresGuard from "./eslint-rules/admin-route-requires-guard.mjs";

// Local rules, not published as a package.
const local = { rules: { "admin-route-requires-guard": adminRouteRequiresGuard } };

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // SECURITY_SPEC §4: every admin API handler must authorise the caller
    // itself — middleware is not trusted for APIs. Fail the build if a handler
    // in app/api/admin/* is missing a require* guard call.
    name: "cse-council/admin-route-guard",
    files: ["src/app/api/admin/**/route.{ts,tsx}"],
    plugins: { local },
    rules: { "local/admin-route-requires-guard": "error" },
  },
  {
    // SECURITY_SPEC §5: dangerouslySetInnerHTML is banned. Announcement content
    // is stored as Markdown and rendered through a sanitising allowlist, so raw
    // HTML injection has no entry point. CSP nonces are the backstop.
    name: "cse-council/security",
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message:
            "dangerouslySetInnerHTML is banned (SECURITY_SPEC §5). Render sanitised Markdown via the approved pipeline instead.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
