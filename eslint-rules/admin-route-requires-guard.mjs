/**
 * ESLint rule: every exported HTTP handler in an `app/api/admin/*` route file
 * must call an authorisation guard. SECURITY_SPEC §4 requires each admin API
 * handler to re-check the session/capability itself — middleware is not trusted
 * for APIs. This rule turns a forgotten guard into a build failure.
 *
 * Scope is applied via the `files` glob in eslint.config.mjs, so the rule does
 * not inspect the filename itself.
 */

const HTTP_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

// The route-handler guards from src/lib/auth/guards.ts. Page guards (redirect)
// and requireSameOrigin (CSRF only) are deliberately excluded: they do not
// authorise an API caller.
const DEFAULT_GUARDS = ["requireSession", "requireRole", "requireCapability"];

/** Is `node` a call to one of the named guards? Handles `requireX()` and
 *  member forms like `guards.requireX()`. */
function isGuardCall(node, guardSet) {
  if (!node || node.type !== "CallExpression") return false;
  const callee = node.callee;
  if (callee.type === "Identifier") return guardSet.has(callee.name);
  if (callee.type === "MemberExpression" && callee.property.type === "Identifier") {
    return guardSet.has(callee.property.name);
  }
  return false;
}

/** Recursively scan an AST subtree for any guard call, ignoring `parent`
 *  back-references so the walk terminates. */
function containsGuardCall(node, guardSet, seen) {
  if (!node || typeof node !== "object") return false;
  if (Array.isArray(node)) {
    for (const el of node) {
      if (containsGuardCall(el, guardSet, seen)) return true;
    }
    return false;
  }
  if (typeof node.type !== "string") return false;
  if (seen.has(node)) return false;
  seen.add(node);
  if (isGuardCall(node, guardSet)) return true;
  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    if (containsGuardCall(node[key], guardSet, seen)) return true;
  }
  return false;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require an admin auth guard (requireSession/requireRole/requireCapability) in every app/api/admin/* route handler.",
    },
    schema: [
      {
        type: "object",
        properties: {
          guards: { type: "array", items: { type: "string" }, minItems: 1 },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingGuard:
        "Admin API handler `{{method}}` has no auth guard. Call one of: {{guards}} (SECURITY_SPEC §4).",
    },
  },

  create(context) {
    const options = context.options[0] ?? {};
    const guardSet = new Set(options.guards ?? DEFAULT_GUARDS);
    const guardList = [...guardSet].join(", ");

    function checkHandler(fnNode, nameNode) {
      if (!containsGuardCall(fnNode.body, guardSet, new Set())) {
        context.report({
          node: nameNode,
          messageId: "missingGuard",
          data: { method: nameNode.name, guards: guardList },
        });
      }
    }

    return {
      ExportNamedDeclaration(node) {
        const decl = node.declaration;
        if (!decl) return;

        // export async function GET(...) { ... }
        if (
          decl.type === "FunctionDeclaration" &&
          decl.id &&
          HTTP_METHODS.has(decl.id.name)
        ) {
          checkHandler(decl, decl.id);
          return;
        }

        // export const GET = async (...) => { ... }
        if (decl.type === "VariableDeclaration") {
          for (const d of decl.declarations) {
            if (
              d.id.type === "Identifier" &&
              HTTP_METHODS.has(d.id.name) &&
              d.init &&
              (d.init.type === "ArrowFunctionExpression" ||
                d.init.type === "FunctionExpression")
            ) {
              checkHandler(d.init, d.id);
            }
          }
        }
      },
    };
  },
};

export default rule;
