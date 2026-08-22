import { RuleTester } from "eslint";
import { afterAll, describe, it } from "vitest";
// The rule lives outside src/ so eslint.config.mjs (repo root, ESM) can import it.
import rule from "../../../eslint-rules/admin-route-requires-guard.mjs";

// RuleTester discovers the test framework via these statics; vitest globals are
// off in this project, so wire them explicitly. Object.assign avoids the
// @types/eslint gap (afterAll/itOnly aren't declared on the class).
Object.assign(RuleTester, { afterAll, describe, it, itOnly: it.only });

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

const guarded = `const g = await requireSession(); if (!g.ok) return g.response;`;
// The default guard list, as it appears hydrated in the message.
const GUARDS = "requireSession, requireRole, requireCapability";

ruleTester.run("admin-route-requires-guard", rule, {
  valid: [
    // requireSession at the top of the handler
    `export async function GET(request) { ${guarded} return Response.json({}); }`,
    // requireCapability counts
    `export async function POST(request) {
       const g = await requireCapability("manage:events", clubId);
       if (!g.ok) return g.response;
       return Response.json({});
     }`,
    // requireRole counts
    `export async function DELETE() {
       const g = await requireRole(["tech_head"]);
       if (!g.ok) return g.response;
       return new Response(null, { status: 204 });
     }`,
    // arrow-function export form
    `export const PATCH = async (request) => { ${guarded} return Response.json({}); };`,
    // multiple handlers, each guarded
    `export async function GET() { ${guarded} return Response.json({}); }
     export async function POST() { ${guarded} return Response.json({}); }`,
    // non-handler exports are ignored even without a guard
    `export function toRow(x) { return x; }
     export async function GET() { ${guarded} return Response.json({}); }`,
  ],
  invalid: [
    // no guard at all
    {
      code: `export async function GET(request) { return Response.json({ ok: true }); }`,
      errors: [{ messageId: "missingGuard", data: { method: "GET", guards: GUARDS } }],
    },
    // GET guarded but POST is not — only POST should be flagged
    {
      code: `export async function GET() { ${guarded} return Response.json({}); }
             export async function POST(request) { return Response.json({}); }`,
      errors: [{ messageId: "missingGuard", data: { method: "POST", guards: GUARDS } }],
    },
    // arrow form missing a guard
    {
      code: `export const PUT = async (request) => { return Response.json({}); };`,
      errors: [{ messageId: "missingGuard", data: { method: "PUT", guards: GUARDS } }],
    },
    // CSRF-only: requireSameOrigin is NOT an auth guard, so this must still fail
    {
      code: `export async function POST(request) {
               const bad = requireSameOrigin(request);
               if (bad) return bad;
               return Response.json({});
             }`,
      errors: [{ messageId: "missingGuard", data: { method: "POST", guards: GUARDS } }],
    },
  ],
});
