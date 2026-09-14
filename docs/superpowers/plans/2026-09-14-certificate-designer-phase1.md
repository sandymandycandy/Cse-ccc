# Certificate Designer — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the v1 one-name certificate positioner with a per-event designer. Admins upload a base template, place logos and signatures, and type rich text containing data fields (name, department, event, form answers…). They preview the result per attendee and bulk-issue emailed PDFs that match the editor exactly.

**Architecture:** A pure, shared layout engine (`src/lib/certificates/layout.ts`) measures text with pre-computed metrics from the bundled TTFs. The browser editor draws its output as SVG, and the server draws the same output into a PDF with `pdf-lib` (spec D7). The design is a JSON document stored per recipient group (`certificate_groups`). Issuing snapshots an immutable design version plus the field values into the existing `certificates` ledger (reserve → render → send → delete on failure).

**Tech Stack:** Next.js 16.3.1 App Router · React 19.2 · TypeScript strict · Supabase (Postgres + Storage) · `pdf-lib` 1.17.1 + `@pdf-lib/fontkit` 1.1.1 · TipTap 3.31.3 · Zod 4 · Vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-14-certificate-designer-design.md` (read §2, §4, §5.1–5.2, §6 before starting). This plan is **phase 1** of spec §11. Phase 2 (team members, sheet groups, Recipients tab, downloads, re-issue/revoke) and phase 3 (QR + `/verify`) get their own plans.

**Pre-verified:** every pure module and every client component below was written and run in a sandbox before this plan was saved. That covered 121 passing Vitest tests and a clean `tsc --strict` against real React 19 and TipTap 3.31.3 types. The spike also showed the metrics-vs-pdf-lib width match across all 24 faces (worst difference 2e-13 px). Server files (Tasks 7–9, 12) could not compile outside the repo; they are verified by the repo gate.

## Global Constraints

- Next.js here is **16.3.1** with breaking changes — read the relevant guide in `node_modules/next/dist/docs/` before writing Next-specific code (AGENTS.md).
- Files are **LF-only**. Edit with the editor tools; never rewrite files through Python text mode.
- **Never run `supabase db push`.** Apply migrations only with the Supabase MCP `apply_migration` tool (project `jisahccdnthzgibszwnq`).
- `dangerouslySetInnerHTML` is banned by ESLint (SECURITY_SPEC §5).
- Every exported handler in `src/app/api/admin/**/route.ts` must call `requireSession` / `requireRole` / `requireCapability` (local ESLint rule).
- Every certificate action and route requires `issue:participation_certificate` **and** `canManage(session, cap, event.clubId)`. Revoke is phase 2.
- Fonts: exactly the 8 families / 24 faces in `font-families.json`; **no synthetic bold/italic**. Faces in `FULL_EMBED_FACES` are embedded whole rather than subset (pdf-lib corrupts their glyphs), guarded by `font-embedding.test.ts`.
- OpenType `liga`, `clig`, `calt`, `dlig`, `kern` are **off on both sides** (PDF embed option + editor CSS).
- The PDF page's long edge is **842 pt**; all design positions are % of the page.
- Design assets live in the **private** bucket `certificate-assets` at `<eventId>/<uuid>.<png|jpg>`, ≤ **8 MB**, PNG/JPEG only.
- Issuing: batches of **40**; reserve ledger row → render → send → delete the row if anything fails (at-most-once).
- New runtime deps (exact): `@pdf-lib/fontkit@1.1.1`, `@tiptap/core@3.31.3`, `@tiptap/pm@3.31.3`, `@tiptap/react@3.31.3`, `@tiptap/starter-kit@3.31.3`, `@tiptap/extension-text-style@3.31.3`.
- Vercel uses `npm ci`: after installing, `package-lock.json` must be committed in sync (see memory `vercel-npm-ci-lockfile`).
- Every commit message ends with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- Tests run in Vitest's **node** environment; `server-only` is aliased to a stub (`vitest.config.mts`), so server modules are testable.

## File map

| File | Responsibility | Task |
| --- | --- | --- |
| `src/lib/certificates/font-families.json` | The one list of bundled families/faces (shared with scripts) | 1 |
| `src/lib/certificates/fonts.ts` | Font registry: faces, CSS names, @font-face CSS | 1 |
| `src/lib/certificates/pdf-features.ts` | The OpenType features switched off on both sides | 1 |
| `scripts/fetch-cert-fonts.mjs`, `scripts/build-font-metrics.mjs` | One-off: download TTFs; generate metrics | 1 |
| `public/fonts/cert/*` | 24 TTFs + OFL licences (generated, committed) | 1 |
| `src/lib/certificates/metrics/*` | Per-face advance widths + `index.ts` (generated, committed) | 1 |
| `src/lib/certificates/font-embedding.test.ts` | Proves every drawn glyph survives into the PDF | 6 |
| `src/lib/certificates/design.ts` | Design document types, validation, v1 conversion, helpers | 2 |
| `src/lib/certificates/image-type.ts` | PNG/JPEG magic bytes + pixel size | 2 |
| `src/lib/certificates/fields.ts` | Field catalogue, value resolution, transforms, IST dates | 3 |
| `src/lib/certificates/layout.ts` | Rich-text layout engine (shared by editor + PDF) | 4 |
| `src/lib/certificates/rich-text.ts` | TipTap JSON ⇄ paragraphs; whole-box style helpers | 5 |
| `src/lib/certificates/render.ts` | Design → multi-page PDF (replaces v1 renderer) | 6 |
| `src/lib/certificates/font-files.ts` | Read bundled TTFs on the server | 6 |
| `supabase/migrations/20260914020000_certificate_designer.sql` | Groups, versions, sheet rows, ledger columns, RPCs, bucket | 7 |
| `src/lib/database.types.ts` | Regenerated types | 7 |
| `src/lib/certificates/recipients.ts` | Recipient status, pending selection, counts, file names | 8 |
| `src/lib/certificates/assets.ts` | Signed URLs, asset loading, new-asset verification | 8 |
| `src/lib/admin/certificates.ts` | Data layer: event context, groups, v1 conversion, workspace | 8 |
| `src/lib/admin/certificate-issue.ts` | One issue batch (reserve → render → send) | 9 |
| `src/app/admin/(app)/events/[id]/certificates/actions.ts` | Save design, signed upload, issue batch, copy design | 9 |
| `src/app/api/admin/events/[id]/certificates/preview/route.ts` | Preview PDF of the unsaved design | 9 |
| `next.config.ts` | Trace font files into certificate functions | 9 |
| `src/components/admin/certificates/geometry.ts` | Move/resize/snap math, unit conversions | 10 |
| `src/components/admin/certificates/designer-state.ts` | Editor reducer with coalesced undo | 10 |
| `src/components/admin/certificates/image-prep.ts` | Rasterise/downscale/re-encode picked images | 10 |
| `src/components/admin/certificates/*.tsx`, `cert-field-node.ts`, `useTextEditor.ts`, `upload.ts` | The editor UI | 11 |
| `src/app/globals.css` | `cd-*` designer styles | 11 |
| `src/app/admin/(app)/events/[id]/certificates/page.tsx` | Design / Issue tabs | 12 |
| `src/components/admin/certificates/IssuePanel.tsx` | Batched issuing with progress | 12 |
| `src/components/admin/CertificateManager.tsx` | **Deleted** (v1) | 12 |
| `src/lib/certificates/config.ts` (+ test) | Trimmed to v1 parsing only | 12 |
| `src/app/dev/certificate-designer/page.tsx`, `DesignerHarness.tsx` | Dev-only editor harness (404 in production) | 13 |
| `docs/STATUS.md` | Shipped entry + owed walkthrough | 14 |

> **Typecheck note:** from Task 6 until Task 12, `npm run typecheck` reports errors in the **v1** files (`certificates/actions.ts` before Task 9, `CertificateManager.tsx`, and the v1 `page.tsx`), because the modules they import are being replaced. That is expected. Tasks 1–11 verify with their own Vitest suites plus a scoped `tsc` check; the full gate is green again from Task 12.

---

### Task 1: Dependencies, bundled fonts and font metrics

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `src/lib/certificates/font-families.json`, `src/lib/certificates/fonts.ts`, `src/lib/certificates/pdf-features.ts`
- Create: `scripts/fetch-cert-fonts.mjs`, `scripts/build-font-metrics.mjs`
- Generate: `public/fonts/cert/*.ttf`, `public/fonts/cert/LICENSE-*.txt`, `src/lib/certificates/metrics/*.json`, `src/lib/certificates/metrics/index.ts`
- Test: `src/lib/certificates/fonts.test.ts`, `src/lib/certificates/metrics.test.ts`

**Interfaces:**
- Produces:
  - `type FontFamilyId`, `type FaceVariant`, `type FaceId`, `interface FaceMetrics`
  - `FONT_FAMILIES`, `FONT_FAMILY_IDS`, `ALL_FACES`, `DEFAULT_FONT`
  - `familyById(id)`, `variantOf(bold, italic)`, `hasVariant(id, bold, italic)`, `faceFor(id, bold, italic): FaceId`
  - `faceFile(face)`, `cssFamily(id)`, `familyFromCss(css): FontFamilyId | null`, `fontFaceCss(baseUrl?)`
  - `NO_FEATURES`, `NO_FEATURES_CSS`; `METRICS: Record<FaceId, FaceMetrics>`

- [ ] **Step 1: Install the new dependencies**

```bash
npm install --save-exact @pdf-lib/fontkit@1.1.1 @tiptap/core@3.31.3 @tiptap/pm@3.31.3 @tiptap/react@3.31.3 @tiptap/starter-kit@3.31.3 @tiptap/extension-text-style@3.31.3
```

Expected: exits 0. If npm fails with `Cannot read properties of null (reading 'edgesOut')` (an npm 10.9 peer-resolution bug hit while preparing this plan), rerun with `--legacy-peer-deps`. Then run `npm ci --dry-run`; it must not report a lock mismatch.

- [ ] **Step 2: Add the family list, the registry and the feature switch-off**

`src/lib/certificates/font-families.json`:

```json
[
  { "id": "playfair", "label": "Playfair Display", "googleName": "Playfair Display", "oflDir": "playfairdisplay", "variants": ["r", "b", "i", "bi"] },
  { "id": "crimson", "label": "Crimson Text", "googleName": "Crimson Text", "oflDir": "crimsontext", "variants": ["r", "b", "i", "bi"] },
  { "id": "lora", "label": "Lora", "googleName": "Lora", "oflDir": "lora", "variants": ["r", "b", "i", "bi"] },
  { "id": "cinzel", "label": "Cinzel", "googleName": "Cinzel", "oflDir": "cinzel", "variants": ["r", "b"] },
  { "id": "montserrat", "label": "Montserrat", "googleName": "Montserrat", "oflDir": "montserrat", "variants": ["r", "b", "i", "bi"] },
  { "id": "poppins", "label": "Poppins", "googleName": "Poppins", "oflDir": "poppins", "variants": ["r", "b", "i", "bi"] },
  { "id": "greatvibes", "label": "Great Vibes", "googleName": "Great Vibes", "oflDir": "greatvibes", "variants": ["r"] },
  { "id": "pinyon", "label": "Pinyon Script", "googleName": "Pinyon Script", "oflDir": "pinyonscript", "variants": ["r"] }
]
```

`src/lib/certificates/fonts.ts`:

```ts
import familyData from "./font-families.json";

/**
 * The bundled certificate fonts (spec §6.1). Static TTF instances live in
 * public/fonts/cert/<faceId>.ttf. The editor loads them with @font-face and
 * the PDF renderer reads the same files from disk, so both draw with identical
 * glyphs. font-families.json is the single list, shared with the two scripts.
 */

export type FontFamilyId =
  | "playfair"
  | "crimson"
  | "lora"
  | "cinzel"
  | "montserrat"
  | "poppins"
  | "greatvibes"
  | "pinyon";

/** r = regular, b = bold, i = italic, bi = bold italic. */
export type FaceVariant = "r" | "b" | "i" | "bi";

/** Every face that actually ships (must match font-families.json). */
export type FaceId =
  | "playfair-r" | "playfair-b" | "playfair-i" | "playfair-bi"
  | "crimson-r" | "crimson-b" | "crimson-i" | "crimson-bi"
  | "lora-r" | "lora-b" | "lora-i" | "lora-bi"
  | "cinzel-r" | "cinzel-b"
  | "montserrat-r" | "montserrat-b" | "montserrat-i" | "montserrat-bi"
  | "poppins-r" | "poppins-b" | "poppins-i" | "poppins-bi"
  | "greatvibes-r"
  | "pinyon-r";

export interface FontFamily {
  id: FontFamilyId;
  label: string;
  googleName: string;
  oflDir: string;
  variants: readonly FaceVariant[];
}

/** Advance widths + vertical metrics for one face, in font units. */
export interface FaceMetrics {
  unitsPerEm: number;
  ascent: number;
  /** Negative: distance below the baseline. */
  descent: number;
  /** Negative: underline offset below the baseline. */
  underlinePosition: number;
  underlineThickness: number;
  /** Codepoint (decimal string) → advance width. A missing key = no glyph. */
  widths: Record<string, number>;
}

export const FONT_FAMILIES = familyData as readonly FontFamily[];

export const FONT_FAMILY_IDS: readonly FontFamilyId[] = FONT_FAMILIES.map((f) => f.id);

export const DEFAULT_FONT: FontFamilyId = "playfair";

export function familyById(id: FontFamilyId): FontFamily {
  const family = FONT_FAMILIES.find((f) => f.id === id);
  if (!family) throw new Error(`Unknown font family "${id}"`);
  return family;
}

export function variantOf(bold: boolean, italic: boolean): FaceVariant {
  if (bold && italic) return "bi";
  if (bold) return "b";
  if (italic) return "i";
  return "r";
}

/** Does this family ship the requested weight/style? (No synthetic faces.) */
export function hasVariant(id: FontFamilyId, bold: boolean, italic: boolean): boolean {
  return familyById(id).variants.includes(variantOf(bold, italic));
}

/**
 * The face to draw with. Validation rejects unavailable combinations, so the
 * regular fallback only guards against a stale design reaching the renderer.
 */
export function faceFor(id: FontFamilyId, bold: boolean, italic: boolean): FaceId {
  return (hasVariant(id, bold, italic) ? `${id}-${variantOf(bold, italic)}` : `${id}-r`) as FaceId;
}

export const faceFile = (face: FaceId): string => `${face}.ttf`;

/**
 * Faces pdf-lib must embed whole rather than subset.
 *
 * pdf-lib's subsetter writes a broken `glyf` table for some fonts — the glyphs
 * it emits cannot be decoded again, which prints as blank or garbled text. It
 * hits plain letters, not just accents, so it is never acceptable. These three
 * fail that way and embed correctly when the whole font goes in (~80–125 KB
 * instead of ~6 KB). `font-embedding.test.ts` proves the list is complete:
 * it re-reads the embedded font out of a rendered PDF for every face.
 * Cormorant Garamond was dropped from the bundle over this — pdf-lib cannot
 * embed it at all — and Crimson Text took its place.
 */
export const FULL_EMBED_FACES: ReadonlySet<FaceId> = new Set<FaceId>([
  "poppins-i",
  "poppins-bi",
  "greatvibes-r",
]);

export const needsFullEmbed = (face: FaceId): boolean => FULL_EMBED_FACES.has(face);

/** CSS font-family name the editor registers each family under. */
export const cssFamily = (id: FontFamilyId): string => `cert-${id}`;

export function familyFromCss(css: string): FontFamilyId | null {
  const clean = css.replace(/["']/g, "").split(",")[0].trim();
  const id = clean.startsWith("cert-") ? clean.slice(5) : "";
  return (FONT_FAMILY_IDS as readonly string[]).includes(id) ? (id as FontFamilyId) : null;
}

/** @font-face rules for every bundled face, for the editor page. */
export function fontFaceCss(baseUrl = "/fonts/cert"): string {
  return FONT_FAMILIES.flatMap((family) =>
    family.variants.map((variant) => {
      const bold = variant === "b" || variant === "bi";
      const italic = variant === "i" || variant === "bi";
      return (
        `@font-face{font-family:"${cssFamily(family.id)}";` +
        `src:url("${baseUrl}/${family.id}-${variant}.ttf") format("truetype");` +
        `font-weight:${bold ? 700 : 400};font-style:${italic ? "italic" : "normal"};font-display:block}`
      );
    }),
  ).join("\n");
}

/** Every face id, in family order. */
export const ALL_FACES: readonly FaceId[] = FONT_FAMILIES.flatMap((f) =>
  f.variants.map((v) => `${f.id}-${v}` as FaceId),
);
```

`src/lib/certificates/pdf-features.ts`:

```ts
/**
 * OpenType features switched off on BOTH sides (spec §6.2): pdf-lib's embed
 * option here, and the matching CSS in the editor (`.cd-text`). With ligatures,
 * contextual alternates and kerning off, a glyph's advance is exactly the width
 * in metrics/*.json, so the browser and the PDF break lines identically.
 */
export const NO_FEATURES = { liga: false, clig: false, calt: false, dlig: false, kern: false };

export const NO_FEATURES_CSS =
  'font-kerning:none;font-feature-settings:"liga" 0,"clig" 0,"calt" 0,"dlig" 0,"kern" 0;font-synthesis:none';
```

- [ ] **Step 3: Write the registry test**

`src/lib/certificates/fonts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  ALL_FACES,
  faceFor,
  familyFromCss,
  fontFaceCss,
  hasVariant,
  variantOf,
  cssFamily,
} from "./fonts";

describe("fonts registry", () => {
  it("lists 24 faces across the 8 families", () => {
    expect(ALL_FACES).toHaveLength(24);
    expect(ALL_FACES).toContain("playfair-bi");
    expect(ALL_FACES).toContain("pinyon-r");
  });

  it("maps bold/italic to a variant", () => {
    expect(variantOf(false, false)).toBe("r");
    expect(variantOf(true, false)).toBe("b");
    expect(variantOf(false, true)).toBe("i");
    expect(variantOf(true, true)).toBe("bi");
  });

  it("knows which families lack bold or italic", () => {
    expect(hasVariant("lora", true, true)).toBe(true);
    expect(hasVariant("cinzel", true, false)).toBe(true);
    expect(hasVariant("cinzel", false, true)).toBe(false);
    expect(hasVariant("greatvibes", true, false)).toBe(false);
  });

  it("falls back to the regular face for an unavailable combination", () => {
    expect(faceFor("montserrat", true, true)).toBe("montserrat-bi");
    expect(faceFor("greatvibes", true, true)).toBe("greatvibes-r");
  });

  it("round-trips the CSS family name", () => {
    expect(familyFromCss(cssFamily("poppins"))).toBe("poppins");
    expect(familyFromCss('"cert-lora", serif')).toBe("lora");
    expect(familyFromCss("Arial")).toBeNull();
  });

  it("emits one @font-face per face", () => {
    const css = fontFaceCss();
    expect(css.match(/@font-face/g)).toHaveLength(24);
    expect(css).toContain('src:url("/fonts/cert/cinzel-b.ttf")');
    expect(css).toContain("font-weight:700;font-style:italic");
  });
});
```

- [ ] **Step 4: Run it**

Run: `npx vitest run src/lib/certificates/fonts.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Add the two scripts**

`scripts/fetch-cert-fonts.mjs`:

```js
/**
 * One-off: download the bundled certificate fonts (spec §6.1) as static TTFs
 * from the Google Fonts CSS API, plus each family's OFL licence. Output goes to
 * public/fonts/cert/ and is committed. Re-run only to add or refresh a family.
 *
 *   node scripts/fetch-cert-fonts.mjs
 *
 * An old Safari user agent makes the API answer with `format('truetype')`
 * static instances instead of variable woff2.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import families from "../src/lib/certificates/font-families.json" with { type: "json" };

const OUT = path.join(import.meta.dirname, "..", "public", "fonts", "cert");
const UA =
  "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1";
const AXES = { r: [0, 400], b: [0, 700], i: [1, 400], bi: [1, 700] };

function cssUrl(family) {
  const name = family.googleName.replace(/ /g, "+");
  const tuples = family.variants.map((v) => AXES[v]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (family.variants.length === 1 && family.variants[0] === "r") return `https://fonts.googleapis.com/css2?family=${name}`;
  if (tuples.every(([ital]) => ital === 0)) {
    return `https://fonts.googleapis.com/css2?family=${name}:wght@${tuples.map((t) => t[1]).join(";")}`;
  }
  return `https://fonts.googleapis.com/css2?family=${name}:ital,wght@${tuples.map((t) => t.join(",")).join(";")}`;
}

async function get(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res;
}

await mkdir(OUT, { recursive: true });
for (const family of families) {
  const css = await (await get(cssUrl(family), { headers: { "user-agent": UA } })).text();
  const blocks = css.split("@font-face").slice(1);
  for (const variant of family.variants) {
    const [ital, wght] = AXES[variant];
    const block = blocks.find(
      (b) =>
        b.includes(`font-style: ${ital ? "italic" : "normal"}`) && b.includes(`font-weight: ${wght}`),
    );
    const url = block?.match(/url\((https:[^)]+\.ttf)\)/)?.[1];
    if (!url) throw new Error(`No TTF for ${family.id}-${variant}`);
    const bytes = new Uint8Array(await (await get(url)).arrayBuffer());
    await writeFile(path.join(OUT, `${family.id}-${variant}.ttf`), bytes);
    console.log(`${family.id}-${variant}.ttf  ${(bytes.length / 1024).toFixed(0)} KB`);
  }
  const licence = await (
    await get(`https://raw.githubusercontent.com/google/fonts/main/ofl/${family.oflDir}/OFL.txt`)
  ).text();
  await writeFile(path.join(OUT, `LICENSE-${family.id}.txt`), licence);
}
```

`scripts/build-font-metrics.mjs`:

```js
/**
 * Generate src/lib/certificates/metrics/<faceId>.json + index.ts from the TTFs in
 * public/fonts/cert (spec §6.2). The layout engine measures text with these
 * advance widths in the browser and on the server; metrics.test.ts proves they
 * equal pdf-lib's own widths. Re-run after scripts/fetch-cert-fonts.mjs.
 *
 *   node scripts/build-font-metrics.mjs
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import families from "../src/lib/certificates/font-families.json" with { type: "json" };

const ROOT = path.join(import.meta.dirname, "..");
const FONTS = path.join(ROOT, "public", "fonts", "cert");
const OUT = path.join(ROOT, "src", "lib", "certificates", "metrics");
/** Basic Latin, Latin-1, Latin Extended-A/B, General Punctuation, ₹. */
const RANGES = [[0x20, 0x7e], [0xa0, 0x24f], [0x2000, 0x206f], [0x20b9, 0x20b9]];

await mkdir(OUT, { recursive: true });
const faces = [];
for (const family of families) {
  for (const variant of family.variants) {
    const face = `${family.id}-${variant}`;
    const font = fontkit.create(await readFile(path.join(FONTS, `${face}.ttf`)));
    const widths = {};
    for (const [from, to] of RANGES) {
      for (let cp = from; cp <= to; cp++) {
        if (font.hasGlyphForCodePoint(cp)) widths[cp] = font.glyphForCodePoint(cp).advanceWidth;
      }
    }
    const metrics = {
      unitsPerEm: font.unitsPerEm,
      ascent: font.ascent,
      descent: font.descent,
      underlinePosition: font.underlinePosition,
      underlineThickness: font.underlineThickness,
      widths,
    };
    await writeFile(path.join(OUT, `${face}.json`), JSON.stringify(metrics) + "\n");
    faces.push(face);
  }
}

const ident = (face) => face.replace(/-(\w+)$/, (_, v) => v.toUpperCase());
const index = [
  "// GENERATED by scripts/build-font-metrics.mjs — do not edit by hand.",
  'import type { FaceId, FaceMetrics } from "../fonts";',
  ...faces.map((f) => `import ${ident(f)} from "./${f}.json";`),
  "",
  "export const METRICS: Record<FaceId, FaceMetrics> = {",
  ...faces.map((f) => `  "${f}": ${ident(f)},`),
  "};",
  "",
].join("\n");
await writeFile(path.join(OUT, "index.ts"), index);
console.log(`wrote ${faces.length} faces`);
```

- [ ] **Step 6: Write the metrics parity test (fails: no fonts or metrics yet)**

`src/lib/certificates/metrics.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { ALL_FACES, faceFile } from "./fonts";
import { METRICS } from "./metrics";
import { NO_FEATURES } from "./pdf-features";

// The whole preview-equals-PDF promise rests on this: the widths the layout
// engine measures with must be the widths pdf-lib draws with.
const SAMPLE = "The quick brown fox — “Venkata” Śrī office ffi AVAWAY Tê ₹1,000 ‘ok’…";

describe("font metrics", () => {
  it("has metrics for every bundled face", () => {
    expect(Object.keys(METRICS).sort()).toEqual([...ALL_FACES].sort());
  });

  it.each(ALL_FACES)("%s widths equal pdf-lib's", async (face) => {
    const m = METRICS[face];
    const bytes = readFileSync(path.join(process.cwd(), "public", "fonts", "cert", faceFile(face)));
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const font = await pdf.embedFont(bytes, { subset: true, features: NO_FEATURES });
    const text = [...SAMPLE].filter((ch) => m.widths[ch.codePointAt(0)!] !== undefined).join("");
    const ours =
      ([...text].reduce((sum, ch) => sum + m.widths[ch.codePointAt(0)!], 0) / m.unitsPerEm) * 50;
    expect(text.length).toBeGreaterThan(40);
    expect(ours).toBeCloseTo(font.widthOfTextAtSize(text, 50), 6);
  });
});
```

Run: `npx vitest run src/lib/certificates/metrics.test.ts`
Expected: FAIL — `Failed to resolve import "./metrics"`.

- [ ] **Step 7: Download the fonts and generate the metrics**

```bash
node scripts/fetch-cert-fonts.mjs
node scripts/build-font-metrics.mjs
```

Expected: 24 lines `…ttf  NN KB` then `wrote 24 faces`. `public/fonts/cert/` holds 24 `.ttf` + 8 `LICENSE-*.txt` (~4.1 MB). `src/lib/certificates/metrics/` holds 24 `.json` + `index.ts` (~150 KB).

- [ ] **Step 8: Run the parity test**

Run: `npx vitest run src/lib/certificates/metrics.test.ts src/lib/certificates/fonts.test.ts`
Expected: PASS, 31 tests (1 + 24 parity + 6 registry).

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json scripts/fetch-cert-fonts.mjs scripts/build-font-metrics.mjs public/fonts/cert src/lib/certificates/font-families.json src/lib/certificates/fonts.ts src/lib/certificates/fonts.test.ts src/lib/certificates/pdf-features.ts src/lib/certificates/metrics src/lib/certificates/metrics.test.ts
git commit -m "feat(certificates): bundle 8 OFL font families with pdf-lib-exact metrics

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Design document model and image sniffing

**Files:**
- Create: `src/lib/certificates/design.ts`, `src/lib/certificates/image-type.ts`
- Test: `src/lib/certificates/design.test.ts`, `src/lib/certificates/image-type.test.ts`

**Interfaces:**
- Consumes: `FONT_FAMILY_IDS`, `DEFAULT_FONT`, `hasVariant`, `FontFamilyId` (Task 1); `CertificateConfig` type from the existing `src/lib/certificates/config.ts`.
- Produces:
  - Types: `Design`, `DesignElement`, `ImageElement`, `TextElement`, `Paragraph`, `Run`, `Style`, `FieldTransform`, `AssetRef`, `AssetBucket`, `DesignContext`, `DesignResult`
  - Constants: `CERT_ASSET_BUCKET = "certificate-assets"`, `LEGACY_TEMPLATE_BUCKET = "certificate-templates"`, `DEFAULT_PAGE`, `DEFAULT_STYLE`, `LIMITS`, `MAX_ASSET_BYTES`
  - Functions: `emptyDesign()`, `validateDesign(raw, ctx): DesignResult`, `parseStoredDesign(raw): Design | null`, `isKnownField(key, ctx)`, `assetRefsOf(design)`, `assetKey(ref)`, `canonicalJson(value)`, `designFromLegacyConfig(template, config)`, `newElementId()`
  - `sniffImage(bytes): { type: "png" | "jpg"; width; height } | null`

- [ ] **Step 1: Write the failing tests**

`src/lib/certificates/image-type.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sniffImage } from "./image-type";

// 1×1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/** A structurally valid JPEG header: SOI, an APP0 segment, then SOF0 (h=480, w=640). */
function jpegHeader(): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof0, 0xff, 0xd9]);
}

describe("sniffImage", () => {
  it("reads a PNG's size", () => {
    expect(sniffImage(new Uint8Array(PNG))).toEqual({ type: "png", width: 1, height: 1 });
  });

  it("reads a JPEG's size from its SOF segment", () => {
    expect(sniffImage(jpegHeader())).toEqual({ type: "jpg", width: 640, height: 480 });
  });

  it("rejects anything else", () => {
    expect(sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });
});
```

`src/lib/certificates/design.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  canonicalJson,
  designFromLegacyConfig,
  emptyDesign,
  isKnownField,
  validateDesign,
  DEFAULT_STYLE,
  assetRefsOf,
  newElementId,
  parseStoredDesign,
  assetKey,
  type Design,
  type DesignContext,
  type TextElement,
} from "./design";

const ctx: DesignContext = { formFieldIds: new Set(["project"]), sheetColumns: new Set() };

const text = (over: Partial<TextElement> = {}): TextElement => ({
  id: "t1",
  name: "Body",
  type: "text",
  x: 10,
  y: 40,
  w: 80,
  h: 10,
  locked: false,
  hidden: false,
  align: "center",
  lineHeight: 1.3,
  fit: "wrap",
  paragraphs: [
    {
      runs: [
        { kind: "text", text: "This is to certify that ", style: DEFAULT_STYLE },
        { kind: "field", field: "person.name", transform: "title", style: { ...DEFAULT_STYLE, bold: true } },
      ],
    },
  ],
  ...over,
});

const withElements = (...elements: Design["elements"]): Design => ({ ...emptyDesign(), elements });

const UUID_A = "0b7c7c9e-8a51-4c43-9c8e-1f6f0d1c2b3a";
const UUID_B = "9d3e1f0a-1b2c-4d5e-8f90-a1b2c3d4e5f6";

describe("validateDesign", () => {
  it("accepts a well-formed design and lowercases colours", () => {
    const el = text();
    el.paragraphs[0].runs[0] = { kind: "text", text: "Hi ", style: { ...DEFAULT_STYLE, color: "#AABBCC" } };
    const res = validateDesign(withElements(el), ctx);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const run = (res.design.elements[0] as TextElement).paragraphs[0].runs[0];
      expect(run.style.color).toBe("#aabbcc");
    }
  });

  it("rejects junk with a readable message", () => {
    const res = validateDesign({ v: 2 }, ctx);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/^Design is invalid at /);
  });

  it("rejects a bold/italic combination the family lacks", () => {
    const el = text();
    el.paragraphs[0].runs[0] = { kind: "text", text: "Hi", style: { ...DEFAULT_STYLE, font: "greatvibes", bold: true } };
    expect(validateDesign(withElements(el), ctx)).toEqual({
      ok: false,
      error: `"Body" uses a bold/italic style its font doesn't have.`,
    });
  });

  it("rejects unknown fields but accepts this event's form answers", () => {
    const field = (key: string) =>
      text({ paragraphs: [{ runs: [{ kind: "field", field: key, transform: "none", style: DEFAULT_STYLE }] }] });
    expect(validateDesign(withElements(field("form.project")), ctx).ok).toBe(true);
    expect(validateDesign(withElements(field("form.gone")), ctx)).toEqual({
      ok: false,
      error: `"Body" uses a field that no longer exists (form.gone).`,
    });
  });

  it("rejects duplicate element ids and over-long text", () => {
    expect(validateDesign(withElements(text(), text()), ctx)).toEqual({
      ok: false,
      error: `Two elements share the id "t1".`,
    });
    const long = text({
      paragraphs: [
        {
          runs: [
            { kind: "text", text: "a".repeat(1500), style: DEFAULT_STYLE },
            { kind: "text", text: "b".repeat(600), style: DEFAULT_STYLE },
          ],
        },
      ],
    });
    expect(validateDesign(withElements(long), ctx)).toEqual({
      ok: false,
      error: `"Body" has more than 2000 characters.`,
    });
  });

  it("only accepts asset paths of the expected shape", () => {
    const design = emptyDesign();
    design.page.template = { bucket: "certificate-assets", path: "../x.png", type: "png", widthPx: 10, heightPx: 10 };
    expect(validateDesign(design, ctx).ok).toBe(false);
    design.page.template = { ...design.page.template, path: `${UUID_A}/${UUID_B}.png` };
    expect(validateDesign(design, ctx).ok).toBe(true);
    design.page.template = { ...design.page.template, path: `${UUID_A}/${UUID_B}.jpg` };
    expect(validateDesign(design, ctx).ok).toBe(false); // extension must match type
  });
});

describe("isKnownField", () => {
  it("knows the fixed catalogue and checks form/sheet keys against context", () => {
    for (const k of ["person.name", "person.role", "team.members", "event.date", "cert.serial"]) {
      expect(isKnownField(k, ctx)).toBe(true);
    }
    expect(isKnownField("person.password", ctx)).toBe(false);
    expect(isKnownField("sheet.Role", ctx)).toBe(false);
    expect(isKnownField("sheet.Role", { ...ctx, sheetColumns: new Set(["Role"]) })).toBe(true);
  });
});

describe("canonicalJson", () => {
  it("is independent of key order and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(canonicalJson({ a: [{ c: 3, d: 2 }], b: 1 }));
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});

describe("designFromLegacyConfig", () => {
  it("turns the v1 anchor into a centred shrink-to-fit name box", () => {
    const d = designFromLegacyConfig(
      { path: `${UUID_A}.png`, type: "png", widthPx: 2000, heightPx: 1414 },
      { nameXPct: 60, nameYPct: 47, fontPct: 4, align: "center", color: "#112233" },
    );
    expect(d.page).toMatchObject({ widthPx: 2000, heightPx: 1414, template: { bucket: "certificate-templates" } });
    const el = d.elements[0] as TextElement;
    expect(el).toMatchObject({ x: 30, w: 60, y: 43, h: 8, fit: "shrink", align: "center" });
    expect(el.paragraphs[0].runs[0]).toMatchObject({
      kind: "field",
      field: "person.name",
      style: { font: "playfair", bold: true, sizePct: 4, color: "#112233" },
    });
    expect(validateDesign(d, ctx).ok).toBe(true);
  });

  it("anchors left- and right-aligned names at the old edge", () => {
    const tpl = { path: `${UUID_A}.jpg`, type: "jpg" as const, widthPx: 100, heightPx: 100 };
    const base = { nameYPct: 50, fontPct: 5, color: "#000000" };
    expect(designFromLegacyConfig(tpl, { ...base, nameXPct: 20, align: "left" }).elements[0].x).toBe(20);
    expect(designFromLegacyConfig(tpl, { ...base, nameXPct: 90, align: "right" }).elements[0].x).toBe(30);
  });
});

describe("parseStoredDesign", () => {
  it("keeps a stored design whose form field was deleted since, rejects a broken shape", () => {
    const d = withElements(
      text({ paragraphs: [{ runs: [{ kind: "field", field: "form.deleted", transform: "none", style: DEFAULT_STYLE }] }] }),
    );
    expect(parseStoredDesign(JSON.parse(JSON.stringify(d)))).toEqual(d);
    expect(parseStoredDesign({ v: 1 })).toBeNull();
    expect(parseStoredDesign(null)).toBeNull();
  });
});

describe("helpers", () => {
  it("keys assets by bucket and path", () => {
    expect(assetKey({ bucket: "certificate-assets", path: "e/a.png" })).toBe("certificate-assets/e/a.png");
  });

  it("lists asset refs, template first", () => {
    const d = emptyDesign();
    d.page.template = { bucket: "certificate-assets", path: "a", type: "png", widthPx: 1, heightPx: 1 };
    d.elements.push({
      id: "i1",
      name: "Logo",
      type: "image",
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      locked: false,
      hidden: false,
      opacity: 1,
      asset: { bucket: "certificate-assets", path: "b", type: "png", widthPx: 1, heightPx: 1 },
    });
    expect(assetRefsOf(d).map((r) => r.path)).toEqual(["a", "b"]);
  });

  it("makes short lowercase ids", () => {
    expect(newElementId()).toMatch(/^[a-z0-9]{10}$/);
  });
});
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `npx vitest run src/lib/certificates/design.test.ts src/lib/certificates/image-type.test.ts`
Expected: FAIL — `Failed to resolve import "./design"` / `"./image-type"`.

- [ ] **Step 3: Implement**

`src/lib/certificates/image-type.ts`:

```ts
/**
 * Identify a PNG or JPEG from its bytes and read its pixel size — no decoding,
 * no dependencies. Used to check an uploaded asset really is what it claims
 * (magic bytes, spec §8) and to size a v1 template during conversion.
 */
export interface SniffedImage {
  type: "png" | "jpg";
  width: number;
  height: number;
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  if (bytes.length >= 24 && PNG_SIG.every((b, i) => bytes[i] === b)) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { type: "png", width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) return jpegSize(bytes);
  return null;
}

function jpegSize(bytes: Uint8Array): SniffedImage | null {
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i++; // fill byte
      continue;
    }
    // Standalone markers carry no length.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      const height = (bytes[i + 5] << 8) | bytes[i + 6];
      const width = (bytes[i + 7] << 8) | bytes[i + 8];
      return width > 0 && height > 0 ? { type: "jpg", width, height } : null;
    }
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (length < 2) return null;
    i += 2 + length;
  }
  return null;
}
```

`src/lib/certificates/design.ts`:

```ts
import { z } from "zod";
import { DEFAULT_FONT, FONT_FAMILY_IDS, hasVariant, type FontFamilyId } from "./fonts";
import type { CertificateConfig } from "./config";

/**
 * The certificate design document (spec §4.1). Pure and shared: the editor
 * edits it, a server action validates and stores it, the layout engine and
 * PDF renderer read it. Positions are PERCENTAGES of the page (x, w of its
 * width; y, h of its height), so a design survives a template swap and renders
 * at any size.
 */

export type Hex = string;

export const CERT_ASSET_BUCKET = "certificate-assets";
export const LEGACY_TEMPLATE_BUCKET = "certificate-templates";
export type AssetBucket = typeof CERT_ASSET_BUCKET | typeof LEGACY_TEMPLATE_BUCKET;

export interface AssetRef {
  bucket: AssetBucket;
  path: string;
  type: "png" | "jpg";
  widthPx: number;
  heightPx: number;
}

export interface Style {
  font: FontFamilyId;
  /** Font size as a % of the page height. */
  sizePct: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: Hex;
}

export type FieldTransform = "none" | "title" | "upper";

export type Run =
  | { kind: "text"; text: string; style: Style }
  | { kind: "field"; field: string; transform: FieldTransform; style: Style };

export interface Paragraph {
  runs: Run[];
}

interface ElementBase {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  locked: boolean;
  hidden: boolean;
}

export interface ImageElement extends ElementBase {
  type: "image";
  asset: AssetRef;
  opacity: number;
}

export interface TextElement extends ElementBase {
  type: "text";
  align: "left" | "center" | "right";
  lineHeight: number;
  fit: "wrap" | "shrink";
  paragraphs: Paragraph[];
}

export type DesignElement = ImageElement | TextElement;

export interface Design {
  v: 1;
  page: { template: AssetRef | null; widthPx: number; heightPx: number };
  /** Array order is z-order: first is the bottom layer. */
  elements: DesignElement[];
}

/** A4 landscape at 300 dpi — the page size before any template is uploaded. */
export const DEFAULT_PAGE = { widthPx: 3508, heightPx: 2480 } as const;

export const DEFAULT_STYLE: Style = {
  font: DEFAULT_FONT,
  sizePct: 4,
  bold: false,
  italic: false,
  underline: false,
  color: "#1a1a1a",
};

export const LIMITS = {
  elements: 60,
  textChars: 2000,
  runs: 200,
  sizePct: [0.5, 30] as const,
  lineHeight: [0.8, 3] as const,
  pos: [-50, 150] as const,
  size: [0.5, 200] as const,
  assetPx: 20000,
};

/** Field keys the catalogue can produce (spec §2.3). `form.*` / `sheet.*` are checked against context. */
const FIXED_FIELD = /^(person\.(name|roll|department|year|email|phone|role)|team\.(name|members|size)|event\.(title|date|venue|club)|cert\.(serial|issueDate|group))$/;

export function emptyDesign(): Design {
  return { v: 1, page: { template: null, ...DEFAULT_PAGE }, elements: [] };
}

// ── validation ───────────────────────────────────────────────────────────────

const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((s) => s.toLowerCase());

const assetPath: Record<AssetBucket, RegExp> = {
  [CERT_ASSET_BUCKET]: /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg)$/,
  [LEGACY_TEMPLATE_BUCKET]: /^[0-9a-f-]{36}\.(png|jpg)$/,
};

const assetRef = z
  .object({
    bucket: z.enum([CERT_ASSET_BUCKET, LEGACY_TEMPLATE_BUCKET]),
    path: z.string(),
    type: z.enum(["png", "jpg"]),
    widthPx: z.number().int().min(1).max(LIMITS.assetPx),
    heightPx: z.number().int().min(1).max(LIMITS.assetPx),
  })
  .refine((a) => assetPath[a.bucket].test(a.path) && a.path.endsWith(`.${a.type}`), {
    message: "Bad asset path.",
  });

const style = z.object({
  font: z.enum(FONT_FAMILY_IDS as [FontFamilyId, ...FontFamilyId[]]),
  sizePct: z.number().min(LIMITS.sizePct[0]).max(LIMITS.sizePct[1]),
  bold: z.boolean(),
  italic: z.boolean(),
  underline: z.boolean(),
  color: hex,
});

const run = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string().max(LIMITS.textChars), style }),
  z.object({
    kind: z.literal("field"),
    field: z.string().min(1).max(90),
    transform: z.enum(["none", "title", "upper"]),
    style,
  }),
]);

const base = {
  id: z.string().regex(/^[a-z0-9]{1,24}$/),
  name: z.string().trim().min(1).max(60),
  x: z.number().min(LIMITS.pos[0]).max(LIMITS.pos[1]),
  y: z.number().min(LIMITS.pos[0]).max(LIMITS.pos[1]),
  w: z.number().min(LIMITS.size[0]).max(LIMITS.size[1]),
  h: z.number().min(LIMITS.size[0]).max(LIMITS.size[1]),
  locked: z.boolean(),
  hidden: z.boolean(),
};

const element = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("image"), asset: assetRef, opacity: z.number().min(0).max(1) }),
  z.object({
    ...base,
    type: z.literal("text"),
    align: z.enum(["left", "center", "right"]),
    lineHeight: z.number().min(LIMITS.lineHeight[0]).max(LIMITS.lineHeight[1]),
    fit: z.enum(["wrap", "shrink"]),
    paragraphs: z.array(z.object({ runs: z.array(run) })).min(1).max(LIMITS.runs),
  }),
]);

const designSchema = z.object({
  v: z.literal(1),
  page: z.object({
    template: assetRef.nullable(),
    widthPx: z.number().int().min(1).max(LIMITS.assetPx),
    heightPx: z.number().int().min(1).max(LIMITS.assetPx),
  }),
  elements: z.array(element).max(LIMITS.elements),
});

export interface DesignContext {
  /** Ids of the event form's non-identity answer fields (valid `form.<id>` keys). */
  formFieldIds: ReadonlySet<string>;
  /** The group's sheet columns (valid `sheet.<column>` keys). */
  sheetColumns: ReadonlySet<string>;
}

export function isKnownField(key: string, ctx: DesignContext): boolean {
  if (FIXED_FIELD.test(key)) return true;
  if (key.startsWith("form.")) return ctx.formFieldIds.has(key.slice(5));
  if (key.startsWith("sheet.")) return ctx.sheetColumns.has(key.slice(6));
  return false;
}

export type DesignResult = { ok: true; design: Design } | { ok: false; error: string };

/** Parse + check a submitted design. Returns the first human-readable problem. */
export function validateDesign(raw: unknown, ctx: DesignContext): DesignResult {
  const parsed = designSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `Design is invalid at ${issue.path.join(".") || "root"}: ${issue.message}` };
  }
  const design = parsed.data as Design;

  const ids = new Set<string>();
  for (const el of design.elements) {
    if (ids.has(el.id)) return { ok: false, error: `Two elements share the id "${el.id}".` };
    ids.add(el.id);
    if (el.type !== "text") continue;

    let chars = 0;
    let runs = 0;
    for (const p of el.paragraphs) {
      for (const r of p.runs) {
        runs++;
        if (r.kind === "text") chars += r.text.length;
        if (!hasVariant(r.style.font, r.style.bold, r.style.italic)) {
          return { ok: false, error: `"${el.name}" uses a bold/italic style its font doesn't have.` };
        }
        if (r.kind === "field" && !isKnownField(r.field, ctx)) {
          return { ok: false, error: `"${el.name}" uses a field that no longer exists (${r.field}).` };
        }
      }
    }
    if (chars > LIMITS.textChars) return { ok: false, error: `"${el.name}" has more than ${LIMITS.textChars} characters.` };
    if (runs > LIMITS.runs) return { ok: false, error: `"${el.name}" has too many style changes.` };
  }
  return { ok: true, design };
}

/**
 * Read a design already stored by a save (so it passed validation then). Only
 * the shape is checked — a form question deleted since must not wipe the
 * design; the editor shows it as text instead (designWithUnknownFieldsAsText).
 */
export function parseStoredDesign(raw: unknown): Design | null {
  const parsed = designSchema.safeParse(raw);
  return parsed.success ? (parsed.data as Design) : null;
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Largest asset upload accepted (spec §6.4). */
export const MAX_ASSET_BYTES = 8 * 1024 * 1024;

/** Map key for an asset: "<bucket>/<path>". */
export const assetKey = (ref: Pick<AssetRef, "bucket" | "path">): string => `${ref.bucket}/${ref.path}`;

/** Every stored asset the design points at (template first). */
export function assetRefsOf(design: Design): AssetRef[] {
  const refs: AssetRef[] = design.page.template ? [design.page.template] : [];
  for (const el of design.elements) if (el.type === "image") refs.push(el.asset);
  return refs;
}

/** Deterministic JSON (sorted keys) — the input to a design version's hash. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Convert a v1 setup (one uploaded image + one name anchor) into a design:
 * the image becomes the template and the name a shrink-to-fit text box centred
 * on the old anchor. v1 used Times-Bold; Playfair Display bold is the closest
 * bundled face.
 */
export function designFromLegacyConfig(
  template: { path: string; type: "png" | "jpg"; widthPx: number; heightPx: number },
  config: CertificateConfig,
): Design {
  const w = 60;
  const h = Math.min(LIMITS.size[1], Math.max(LIMITS.size[0], config.fontPct * 2));
  const x = config.align === "center" ? config.nameXPct - w / 2 : config.align === "right" ? config.nameXPct - w : config.nameXPct;
  return {
    v: 1,
    page: {
      template: { bucket: LEGACY_TEMPLATE_BUCKET, ...template },
      widthPx: template.widthPx,
      heightPx: template.heightPx,
    },
    elements: [
      {
        id: "name",
        name: "Name",
        type: "text",
        x: clampPos(x),
        y: clampPos(config.nameYPct - h / 2),
        w,
        h,
        locked: false,
        hidden: false,
        align: config.align,
        lineHeight: 1.2,
        fit: "shrink",
        paragraphs: [
          {
            runs: [
              {
                kind: "field",
                field: "person.name",
                transform: "none",
                style: {
                  ...DEFAULT_STYLE,
                  font: "playfair",
                  bold: true,
                  sizePct: Math.min(LIMITS.sizePct[1], Math.max(LIMITS.sizePct[0], config.fontPct)),
                  color: config.color,
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

const clampPos = (n: number) => Math.min(LIMITS.pos[1], Math.max(LIMITS.pos[0], n));

/** Short random element id (a–z, 0–9). */
export function newElementId(random: () => number = Math.random): string {
  let id = "";
  for (let i = 0; i < 10; i++) id += "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(random() * 36)];
  return id;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/certificates/design.test.ts src/lib/certificates/image-type.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/certificates/design.ts src/lib/certificates/design.test.ts src/lib/certificates/image-type.ts src/lib/certificates/image-type.test.ts
git commit -m "feat(certificates): design document model, validation and v1 conversion

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Field catalogue and recipient values

**Files:**
- Create: `src/lib/certificates/fields.ts`
- Test: `src/lib/certificates/fields.test.ts`

**Interfaces:**
- Consumes: `LAYOUT_KINDS`, `FormField`, `defaultFormFor` (`src/lib/registration-form/schema.ts`); `listParticipants`, `RosterEntry` (`src/lib/registration-form/participants.ts`); `DesignContext`, `FieldTransform` (Task 2).
- Produces:
  - Types: `FieldValues = Record<string, string>`, `FieldOption`, `FieldGroup`, `CertEventInfo { title; startsAt; endsAt; venue; clubName }`, `RegistrationForFields`
  - Catalogue: `buildFieldCatalogue({ formSchema, sheetColumns? }): FieldGroup[]`, `answerFields(schema)`, `hasTeamBlock(schema)`, `designContextFor(schema, sheetColumns?)`, `fieldLabel(catalogue, key)`, `fieldNameValue(catalogue): (key) => string`
  - Text: `titleCase(v)`, `applyTransform(v, transform)`, `formatIstDate(d)`, `formatEventDate(startsAt, endsAt)`
  - Values: `registrantValues({ event, schema, registration, groupLabel }): FieldValues`

- [ ] **Step 1: Write the failing test**

`src/lib/certificates/fields.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { defaultFormFor, type FormField } from "@/lib/registration-form/schema";
import {
  applyTransform,
  buildFieldCatalogue,
  designContextFor,
  fieldLabel,
  fieldNameValue,
  formatEventDate,
  registrantValues,
  titleCase,
  type CertEventInfo,
  type RegistrationForFields,
} from "./fields";

const projectQ: FormField = { id: "project", kind: "short_text", identity: null, label: "Project title", required: false };
const section: FormField = { id: "s1", kind: "section", identity: null, label: "About you", required: false };
const teamBlock: FormField = {
  id: "team",
  kind: "team",
  identity: null,
  label: "Team members",
  required: true,
  members: [
    { key: "n", label: "Member name", kind: "short_text", required: true },
    { key: "r", label: "VTU number", kind: "roll", required: false },
  ],
  minMembers: 1,
  maxMembers: 3,
};

const event: CertEventInfo = {
  title: "Hack Night",
  startsAt: "2026-09-14T04:30:00Z",
  endsAt: "2026-09-14T12:30:00Z",
  venue: "Lab 3",
  clubName: "Coding Club",
};

const reg: RegistrationForFields = {
  name: "asha r",
  roll: "VTU1001",
  department: "CSE",
  year: 3,
  email: "vtu1001@veltech.edu.in",
  phone: null,
  teamName: "Byte Me",
  customAnswers: { project: "Smart Bins", team: [{ n: "Ravi K", r: "VTU1002" }, { n: "", r: "" }] },
};

describe("buildFieldCatalogue", () => {
  it("offers person, event and certificate groups on a plain form", () => {
    const groups = buildFieldCatalogue({ formSchema: defaultFormFor() });
    expect(groups.map((g) => g.id)).toEqual(["person", "event", "cert"]);
  });

  it("adds team and form-answer groups when the form has them, skipping layout blocks", () => {
    const groups = buildFieldCatalogue({ formSchema: [...defaultFormFor(), section, projectQ, teamBlock] });
    expect(groups.map((g) => g.id)).toEqual(["person", "team", "event", "form", "cert"]);
    expect(groups.find((g) => g.id === "form")!.fields).toEqual([{ key: "form.project", label: "Project title" }]);
  });

  it("adds sheet columns when given", () => {
    const groups = buildFieldCatalogue({ formSchema: [], sheetColumns: ["Role"] });
    expect(groups.find((g) => g.id === "sheet")!.fields).toEqual([{ key: "sheet.Role", label: "Role" }]);
  });

  it("labels keys, falling back to the raw key", () => {
    const groups = buildFieldCatalogue({ formSchema: [projectQ] });
    expect(fieldLabel(groups, "form.project")).toBe("Project title");
    expect(fieldLabel(groups, "form.gone")).toBe("form.gone");
    expect(fieldNameValue(groups)("person.name")).toBe("{Name}");
  });
});

describe("designContextFor", () => {
  it("allows this form's answer fields and the given sheet columns", () => {
    const ctx = designContextFor([...defaultFormFor(), section, projectQ, teamBlock], ["Role"]);
    expect([...ctx.formFieldIds]).toEqual(["project"]);
    expect([...ctx.sheetColumns]).toEqual(["Role"]);
  });
});

describe("transforms", () => {
  it("title-cases names typed any old way", () => {
    expect(titleCase("asha r")).toBe("Asha R");
    expect(titleCase("JOHN o'NEIL-SMITH")).toBe("John O'neil-Smith");
    expect(titleCase("dr. k.s. ravi")).toBe("Dr. K.S. Ravi");
  });

  it("applies upper / none", () => {
    expect(applyTransform("Asha", "upper")).toBe("ASHA");
    expect(applyTransform("asha", "none")).toBe("asha");
  });
});

describe("formatEventDate", () => {
  it("prints one IST day", () => {
    expect(formatEventDate("2026-09-14T04:30:00Z", "2026-09-14T12:30:00Z")).toBe("14 September 2026");
  });

  it("uses IST, not UTC, for the day boundary", () => {
    // 20:00 UTC on the 13th is 01:30 IST on the 14th.
    expect(formatEventDate("2026-09-13T20:00:00Z", null)).toBe("14 September 2026");
  });

  it("prints the shortest honest range", () => {
    expect(formatEventDate("2026-09-14T04:30:00Z", "2026-09-15T12:30:00Z")).toBe("14–15 September 2026");
    expect(formatEventDate("2026-09-30T04:30:00Z", "2026-10-02T12:30:00Z")).toBe("30 September – 2 October 2026");
    expect(formatEventDate("2026-12-31T04:30:00Z", "2027-01-01T12:30:00Z")).toBe("31 December 2026 – 1 January 2027");
  });
});

describe("registrantValues", () => {
  it("resolves a solo participant", () => {
    const v = registrantValues({
      event,
      schema: [...defaultFormFor(), projectQ],
      registration: { ...reg, teamName: null },
      groupLabel: "Participation",
    });
    expect(v).toMatchObject({
      "person.name": "asha r",
      "person.year": "3",
      "person.phone": "",
      "person.role": "Participant",
      "team.members": "",
      "team.size": "",
      "event.title": "Hack Night",
      "event.date": "14 September 2026",
      "event.club": "Coding Club",
      "form.project": "Smart Bins",
      "cert.group": "Participation",
    });
  });

  it("resolves a team leader with the whole team, skipping blank member rows", () => {
    const v = registrantValues({
      event,
      schema: [...defaultFormFor(), teamBlock],
      registration: reg,
      groupLabel: "Participation",
    });
    expect(v["person.role"]).toBe("Team leader");
    expect(v["team.name"]).toBe("Byte Me");
    expect(v["team.members"]).toBe("asha r, Ravi K");
    expect(v["team.size"]).toBe("2");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/certificates/fields.test.ts`
Expected: FAIL — `Failed to resolve import "./fields"`.

- [ ] **Step 3: Implement**

`src/lib/certificates/fields.ts`:

```ts
import { LAYOUT_KINDS, type FormField } from "@/lib/registration-form/schema";
import { listParticipants, type RosterEntry } from "@/lib/registration-form/participants";
import type { DesignContext, FieldTransform } from "./design";

/**
 * Fields a design can print (spec §2.3): what the + Field menu offers, and how
 * one recipient's values are worked out. Pure — the caller loads the rows.
 */

export type FieldValues = Record<string, string>;

export interface FieldOption {
  key: string;
  label: string;
}

export interface FieldGroup {
  id: "person" | "team" | "event" | "form" | "sheet" | "cert";
  label: string;
  fields: FieldOption[];
}

/** The event's registration questions that describe the entry: not identity, not layout, not the team roster. */
export function answerFields(schema: FormField[]): FormField[] {
  return schema.filter((f) => !f.identity && f.kind !== "team" && !LAYOUT_KINDS.has(f.kind));
}

/** What a design for this event (and group) may reference — the input to validateDesign. */
export function designContextFor(schema: FormField[], sheetColumns: string[] = []): DesignContext {
  return {
    formFieldIds: new Set(answerFields(schema).map((f) => f.id)),
    sheetColumns: new Set(sheetColumns),
  };
}

export function hasTeamBlock(schema: FormField[]): boolean {
  return schema.some((f) => f.kind === "team");
}

export function buildFieldCatalogue(input: { formSchema: FormField[]; sheetColumns?: string[] }): FieldGroup[] {
  const groups: FieldGroup[] = [
    {
      id: "person",
      label: "Person",
      fields: [
        { key: "person.name", label: "Name" },
        { key: "person.roll", label: "Roll / VTU no." },
        { key: "person.department", label: "Department" },
        { key: "person.year", label: "Year" },
        { key: "person.email", label: "Email" },
        { key: "person.phone", label: "Phone" },
        { key: "person.role", label: "Role" },
      ],
    },
  ];
  const teamy =
    hasTeamBlock(input.formSchema) || input.formSchema.some((f) => f.identity === "team_name");
  if (teamy) {
    groups.push({
      id: "team",
      label: "Team",
      fields: [
        { key: "team.name", label: "Team name" },
        { key: "team.members", label: "Team members" },
        { key: "team.size", label: "Team size" },
      ],
    });
  }
  groups.push({
    id: "event",
    label: "Event",
    fields: [
      { key: "event.title", label: "Event title" },
      { key: "event.date", label: "Event date" },
      { key: "event.venue", label: "Venue" },
      { key: "event.club", label: "Club name" },
    ],
  });
  const answers = answerFields(input.formSchema);
  if (answers.length > 0) {
    groups.push({
      id: "form",
      label: "Form answers",
      fields: answers.map((f) => ({ key: `form.${f.id}`, label: f.label })),
    });
  }
  if (input.sheetColumns?.length) {
    groups.push({
      id: "sheet",
      label: "Sheet columns",
      fields: input.sheetColumns.map((c) => ({ key: `sheet.${c}`, label: c })),
    });
  }
  groups.push({
    id: "cert",
    label: "Certificate",
    fields: [
      { key: "cert.serial", label: "Serial number" },
      { key: "cert.issueDate", label: "Issue date" },
      { key: "cert.group", label: "Group" },
    ],
  });
  return groups;
}

/** Label for a field key; falls back to the key itself for a field that no longer exists. */
export function fieldLabel(catalogue: FieldGroup[], key: string): string {
  for (const g of catalogue) {
    const hit = g.fields.find((f) => f.key === key);
    if (hit) return hit.label;
  }
  return key;
}

/** "asha r" → "Asha R", "JOHN o'NEIL-SMITH" → "John O'neil-Smith". */
export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/(^|[\s\-.(/])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

export function applyTransform(value: string, transform: FieldTransform): string {
  if (transform === "upper") return value.toUpperCase();
  if (transform === "title") return titleCase(value);
  return value;
}

const IST = "Asia/Kolkata";

function istParts(d: Date | string): { day: number; month: string; year: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(typeof d === "string" ? new Date(d) : d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: Number(get("day")), month: get("month"), year: Number(get("year")) };
}

/** "14 September 2026". */
export function formatIstDate(d: Date | string): string {
  const p = istParts(d);
  return `${p.day} ${p.month} ${p.year}`;
}

/** An event's date for print: one day, or the shortest honest range. */
export function formatEventDate(startsAt: string, endsAt: string | null): string {
  const a = istParts(startsAt);
  const b = endsAt ? istParts(endsAt) : a;
  if (a.year !== b.year) return `${formatIstDate(startsAt)} – ${formatIstDate(endsAt!)}`;
  if (a.month !== b.month) return `${a.day} ${a.month} – ${b.day} ${b.month} ${b.year}`;
  if (a.day !== b.day) return `${a.day}–${b.day} ${a.month} ${a.year}`;
  return formatIstDate(startsAt);
}

export interface CertEventInfo {
  title: string;
  startsAt: string;
  endsAt: string | null;
  venue: string | null;
  clubName: string | null;
}

/** The subset of a registration row this module reads. */
export interface RegistrationForFields {
  name: string;
  roll: string;
  department: string | null;
  year: number | null;
  email: string;
  phone: string | null;
  teamName: string | null;
  customAnswers: Record<string, unknown> | null;
}

function eventValues(event: CertEventInfo): FieldValues {
  return {
    "event.title": event.title,
    "event.date": formatEventDate(event.startsAt, event.endsAt),
    "event.venue": event.venue ?? "",
    "event.club": event.clubName ?? "",
  };
}

function answerValues(schema: FormField[], answers: Record<string, unknown> | null): FieldValues {
  const out: FieldValues = {};
  for (const f of answerFields(schema)) {
    const v = answers?.[f.id];
    out[`form.${f.id}`] = Array.isArray(v) ? v.map(String).join(", ") : v == null ? "" : String(v).trim();
  }
  return out;
}

/**
 * Values for the person who submitted a registration — a solo participant, or
 * the leader of a team (spec §3.1). Serial and issue date are filled at issue.
 */
export function registrantValues(input: {
  event: CertEventInfo;
  schema: FormField[];
  registration: RegistrationForFields;
  groupLabel: string;
}): FieldValues {
  const { event, schema, registration: r } = input;
  const team = hasTeamBlock(schema);
  const entry: RosterEntry = {
    name: r.name,
    teamName: r.teamName,
    roll: r.roll,
    department: r.department,
    year: r.year,
    email: r.email,
    phone: r.phone,
    customAnswers: r.customAnswers,
  };
  const people = team ? listParticipants([entry], schema).filter((p) => p.name.trim() !== "") : [];
  return {
    "person.name": r.name.trim(),
    "person.roll": r.roll.trim(),
    "person.department": r.department?.trim() ?? "",
    "person.year": r.year == null ? "" : String(r.year),
    "person.email": r.email.trim(),
    "person.phone": r.phone?.trim() ?? "",
    "person.role": team ? "Team leader" : "Participant",
    "team.name": r.teamName?.trim() ?? "",
    "team.members": people.map((p) => p.name.trim()).join(", "),
    "team.size": team ? String(people.length) : "",
    ...eventValues(event),
    ...answerValues(schema, r.customAnswers),
    "cert.serial": "",
    "cert.issueDate": "",
    "cert.group": input.groupLabel,
  };
}

/** "Field names" preview: every field shows as {Label}. */
export function fieldNameValue(catalogue: FieldGroup[]) {
  return (key: string): string => `{${fieldLabel(catalogue, key)}}`;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/certificates/fields.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/certificates/fields.ts src/lib/certificates/fields.test.ts
git commit -m "feat(certificates): field catalogue, value resolution and IST date formatting

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Rich-text layout engine

**Files:**
- Create: `src/lib/certificates/layout.ts`
- Test: `src/lib/certificates/layout.test.ts`

**Interfaces:**
- Consumes: `faceFor`, `FaceId`, `FaceMetrics`, `FontFamilyId`, `ALL_FACES` (Task 1); `METRICS` (Task 1); `applyTransform` (Task 3); `Paragraph`, `Style`, `TextElement`, `DEFAULT_STYLE` (Task 2).
- Produces:
  - Types: `MetricsTable`, `PageSize { widthPx; heightPx }`, `LaidRun`, `LaidLine`, `TextLayout`
  - `MIN_SHRINK = 0.4`
  - `layoutText(el: TextElement, valueFor: (field: string) => string, page: PageSize, metrics: MetricsTable): TextLayout` — all output in page px, top-left origin

- [ ] **Step 1: Write the failing test**

`src/lib/certificates/layout.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ALL_FACES, type FaceMetrics } from "./fonts";
import { DEFAULT_STYLE, type Style, type TextElement } from "./design";
import { layoutText, MIN_SHRINK, type MetricsTable } from "./layout";
import { METRICS } from "./metrics";

// A fake monospace face: every ASCII glyph is 500/1000 em wide, so at
// sizePct 10 on a 1000 px page (100 px font) each character is exactly 50 px.
const mono: FaceMetrics = {
  unitsPerEm: 1000,
  ascent: 800,
  descent: -200,
  underlinePosition: -100,
  underlineThickness: 50,
  widths: Object.fromEntries(Array.from({ length: 95 }, (_, i) => [String(32 + i), 500])),
};
const FAKE = Object.fromEntries(ALL_FACES.map((f) => [f, mono])) as MetricsTable;
const PAGE = { widthPx: 1000, heightPx: 1000 };
const S: Style = { ...DEFAULT_STYLE, sizePct: 10 };
const none = () => "";

const box = (over: Partial<TextElement>): TextElement => ({
  id: "t",
  name: "T",
  type: "text",
  x: 0,
  y: 0,
  w: 50, // 500 px = 10 characters
  h: 20,
  locked: false,
  hidden: false,
  align: "left",
  lineHeight: 1,
  fit: "wrap",
  paragraphs: [{ runs: [{ kind: "text", text: "", style: S }] }],
  ...over,
});
const textOf = (text: string, style: Style = S) => [{ runs: [{ kind: "text" as const, text, style }] }];
const lineTexts = (l: ReturnType<typeof layoutText>) => l.lines.map((line) => line.runs.map((r) => r.text).join(""));

describe("layoutText — wrapping", () => {
  it("fills lines greedily and drops spaces at line ends", () => {
    const l = layoutText(box({ paragraphs: textOf("aaaa bbbb cccc") }), none, PAGE, FAKE);
    expect(lineTexts(l)).toEqual(["aaaa bbbb", "cccc"]);
    expect(l.lines[0].width).toBe(450);
    expect(l.height).toBe(200);
    expect(l.overflow).toBe(false);
  });

  it("puts the baseline at the half-leading position", () => {
    const l = layoutText(box({ lineHeight: 1.5, paragraphs: textOf("a") }), none, PAGE, FAKE);
    // line box 150, content 80+20=100 → 25 px half-leading, baseline 25 + 80.
    expect(l.lines[0].baseline).toBe(105);
    expect(l.height).toBe(150);
  });

  it("breaks a single word longer than the box by character", () => {
    const l = layoutText(box({ paragraphs: textOf("abcdefghijklmnop") }), none, PAGE, FAKE);
    expect(lineTexts(l)).toEqual(["abcdefghij", "klmnop"]);
  });

  it("keeps a paragraph per line block and gives empty paragraphs a line", () => {
    const l = layoutText(
      box({ paragraphs: [...textOf("one"), { runs: [] }, ...textOf("two")] }),
      none,
      PAGE,
      FAKE,
    );
    expect(lineTexts(l)).toEqual(["one", "", "two"]);
    expect(l.height).toBe(300);
  });

  it("aligns centre and right using the width without trailing spaces", () => {
    const c = layoutText(box({ align: "center", paragraphs: textOf("ab   ") }), none, PAGE, FAKE);
    expect(c.lines[0].runs[0].x).toBe(200); // (500 - 100) / 2
    const r = layoutText(box({ align: "right", x: 10, paragraphs: textOf("ab") }), none, PAGE, FAKE);
    expect(r.lines[0].runs[0].x).toBe(100 + 500 - 100);
  });

  it("flags a wrap box that runs off the bottom of the page", () => {
    // Top at 800 px; each line is 100 px tall.
    const l = layoutText(box({ y: 80, paragraphs: textOf("aaaa bbbb cccc") }), none, PAGE, FAKE);
    expect(l.overflow).toBe(false); // 2 lines end exactly at 1000
    const off = layoutText(box({ y: 80, paragraphs: textOf("aaaa bbbb cccc dddd eeee") }), none, PAGE, FAKE);
    expect(off.overflow).toBe(true);
  });
});

describe("layoutText — rich runs and fields", () => {
  it("resolves fields with transforms and shares one baseline across sizes", () => {
    const big: Style = { ...S, sizePct: 20, bold: true };
    const l = layoutText(
      box({
        w: 100,
        paragraphs: [
          {
            runs: [
              { kind: "text", text: "Hi ", style: S },
              { kind: "field", field: "person.name", transform: "title", style: big },
              { kind: "text", text: "!", style: S },
            ],
          },
        ],
      }),
      (k) => (k === "person.name" ? "asha r" : ""),
      PAGE,
      FAKE,
    );
    const runs = l.lines[0].runs;
    expect(runs.map((r) => r.text)).toEqual(["Hi ", "Asha R", "!"]);
    expect(runs.map((r) => r.x)).toEqual([0, 150, 750]);
    expect(runs[1]).toMatchObject({ size: 200, bold: true, face: "playfair-b" });
    // line box = 200 (largest size × 1); ascent 160, descent 40 → baseline 160.
    expect(l.lines[0].baseline).toBe(160);
  });

  it("keeps a field and its punctuation together as one word when wrapping", () => {
    const l = layoutText(
      box({
        paragraphs: [
          {
            runs: [
              { kind: "text", text: "to ", style: S },
              { kind: "field", field: "person.name", transform: "none", style: S },
              { kind: "text", text: ", ok", style: S },
            ],
          },
        ],
      }),
      () => "Venkata",
      PAGE,
      FAKE,
    );
    expect(lineTexts(l)).toEqual(["to", "Venkata,", "ok"]);
  });

  it("drops characters the face cannot print and reports them", () => {
    const l = layoutText(box({ paragraphs: textOf("José") }), none, PAGE, FAKE);
    expect(lineTexts(l)).toEqual(["Jos"]);
    expect(l.missingGlyphs).toEqual(["é"]);
  });

  it("places underlines below the baseline", () => {
    const l = layoutText(box({ paragraphs: textOf("a", { ...S, underline: true }) }), none, PAGE, FAKE);
    const run = l.lines[0].runs[0];
    // baseline 80; position -100/1000*100 = 10 below; bar 5 thick, centred → top at 87.5.
    expect(run.underline).toEqual({ y: 87.5, thickness: 5 });
  });
});

describe("layoutText — shrink to fit", () => {
  it("leaves text that fits alone, centred vertically in the box", () => {
    const l = layoutText(box({ fit: "shrink", h: 30, paragraphs: textOf("short") }), none, PAGE, FAKE);
    expect(l.scale).toBe(1);
    expect(l.top).toBe(100); // (300 - 100) / 2
  });

  it("scales a long line down to the box width", () => {
    const l = layoutText(box({ fit: "shrink", paragraphs: textOf("a".repeat(20)) }), none, PAGE, FAKE);
    expect(l.scale).toBe(0.5);
    expect(l.lines).toHaveLength(1);
    expect(l.lines[0].width).toBe(500);
    expect(l.lines[0].runs[0].size).toBe(50);
    expect(l.overflow).toBe(false);
  });

  it("stops at the minimum scale and flags overflow", () => {
    const l = layoutText(box({ fit: "shrink", paragraphs: textOf("a".repeat(40)) }), none, PAGE, FAKE);
    expect(l.scale).toBe(MIN_SHRINK);
    expect(l.overflow).toBe(true);
  });
});

describe("layoutText — real metrics", () => {
  it("lays out with a bundled face without throwing", () => {
    const l = layoutText(
      box({ w: 80, paragraphs: textOf("This is to certify that ₹ Śrī participated", { ...S, font: "lora", sizePct: 4 }) }),
      none,
      PAGE,
      METRICS,
    );
    expect(l.lines.length).toBeGreaterThan(0);
    expect(l.missingGlyphs).not.toContain("a");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/certificates/layout.test.ts`
Expected: FAIL — `Failed to resolve import "./layout"`.

- [ ] **Step 3: Implement**

`src/lib/certificates/layout.ts`:

```ts
import { faceFor, type FaceId, type FaceMetrics, type FontFamilyId } from "./fonts";
import { applyTransform } from "./fields";
import type { Paragraph, Style, TextElement } from "./design";

/**
 * The rich-text layout engine (spec §6.2) — pure and shared. The editor draws
 * its output as SVG <text> and the renderer draws the same output into the PDF,
 * so line breaks and positions are decided exactly once. All output is in
 * PAGE PIXELS with a top-left origin.
 */

export type MetricsTable = Record<FaceId, FaceMetrics>;

export interface PageSize {
  widthPx: number;
  heightPx: number;
}

export interface LaidRun {
  x: number;
  width: number;
  text: string;
  face: FaceId;
  family: FontFamilyId;
  bold: boolean;
  italic: boolean;
  /** Font size in page px (after any shrink). */
  size: number;
  color: string;
  /** Underline bar in page px (y = top edge of the bar); null when not underlined. */
  underline: { y: number; thickness: number } | null;
}

export interface LaidLine {
  baseline: number;
  width: number;
  runs: LaidRun[];
}

export interface TextLayout {
  lines: LaidLine[];
  left: number;
  top: number;
  width: number;
  height: number;
  /** Shrink scale applied (1 = none). */
  scale: number;
  /** Did not fit: a shrink box still too wide at MIN_SHRINK, or a wrap box running off the page. */
  overflow: boolean;
  /** Characters dropped because the chosen face has no glyph for them. */
  missingGlyphs: string[];
}

/** A shrink box never scales its text below 40 %. */
export const MIN_SHRINK = 0.4;

interface Glyph {
  ch: string;
  style: Style;
  face: FaceId;
  /** Advance at scale 1, page px. */
  advance: number;
  space: boolean;
}

/** A word: its characters (width) plus the spaces that follow it (trailing). */
interface Word {
  glyphs: Glyph[];
  width: number;
  trailing: number;
}

function toGlyphs(
  paragraph: Paragraph,
  valueFor: (field: string) => string,
  page: PageSize,
  metrics: MetricsTable,
  missing: Set<string>,
): Glyph[] {
  const out: Glyph[] = [];
  for (const run of paragraph.runs) {
    const raw = run.kind === "text" ? run.text : applyTransform(valueFor(run.field), run.transform);
    const face = faceFor(run.style.font, run.style.bold, run.style.italic);
    const m = metrics[face];
    const size = (run.style.sizePct / 100) * page.heightPx;
    for (const ch of raw.replace(/[\r\n\t]+/g, " ")) {
      const units = m.widths[ch.codePointAt(0)!];
      if (units === undefined) {
        missing.add(ch);
        continue;
      }
      out.push({ ch, style: run.style, face, advance: (units / m.unitsPerEm) * size, space: ch === " " });
    }
  }
  return out;
}

function toWords(glyphs: Glyph[]): Word[] {
  const words: Word[] = [];
  let word: Word | null = null;
  let ink = false; // has the current word seen a non-space yet?
  for (const g of glyphs) {
    if (!word || (!g.space && word.trailing > 0)) {
      word = { glyphs: [], width: 0, trailing: 0 };
      words.push(word);
      ink = false;
    }
    word.glyphs.push(g);
    if (g.space && ink) word.trailing += g.advance;
    else {
      word.width += g.advance; // ink, or indentation before any ink
      if (!g.space) ink = true;
    }
  }
  return words;
}

/** Split a word wider than the box into character chunks that each fit. */
function breakWord(word: Word, maxWidth: number, scale: number): Word[] {
  const pieces: Word[] = [];
  let piece: Word = { glyphs: [], width: 0, trailing: 0 };
  for (const g of word.glyphs) {
    if (g.space) {
      piece.glyphs.push(g);
      piece.trailing += g.advance;
      continue;
    }
    if (piece.glyphs.length > 0 && (piece.width + g.advance) * scale > maxWidth) {
      pieces.push(piece);
      piece = { glyphs: [], width: 0, trailing: 0 };
    }
    piece.glyphs.push(g);
    piece.width += g.advance;
  }
  if (piece.glyphs.length > 0) pieces.push(piece);
  return pieces;
}

/** Greedy line fill. `maxWidth` null = one line per paragraph. */
function fillLines(words: Word[], maxWidth: number | null, scale: number): Word[][] {
  const lines: Word[][] = [];
  let line: Word[] = [];
  let width = 0; // unscaled: every word's width + trailing so far
  const place = (w: Word) => {
    if (maxWidth !== null && line.length > 0 && (width + w.width) * scale > maxWidth) {
      lines.push(line);
      line = [];
      width = 0;
    }
    line.push(w);
    width += w.width + w.trailing;
  };
  for (const word of words) {
    if (maxWidth !== null && word.width * scale > maxWidth) breakWord(word, maxWidth, scale).forEach(place);
    else place(word);
  }
  lines.push(line);
  return lines;
}

const sameStyle = (a: Style, b: Style) =>
  a.font === b.font &&
  a.sizePct === b.sizePct &&
  a.bold === b.bold &&
  a.italic === b.italic &&
  a.underline === b.underline &&
  a.color === b.color;

/** Width of a paragraph set on one line, ignoring its final trailing spaces. */
const naturalWidth = (words: Word[]) =>
  words.reduce((sum, w, i) => sum + w.width + (i < words.length - 1 ? w.trailing : 0), 0);

export function layoutText(
  el: TextElement,
  valueFor: (field: string) => string,
  page: PageSize,
  metrics: MetricsTable,
): TextLayout {
  const boxLeft = (el.x / 100) * page.widthPx;
  const boxTop = (el.y / 100) * page.heightPx;
  const boxW = (el.w / 100) * page.widthPx;
  const boxH = (el.h / 100) * page.heightPx;
  const missing = new Set<string>();
  const firstStyle = el.paragraphs.flatMap((p) => p.runs)[0]?.style ?? null;

  const paragraphs = el.paragraphs.map((p) => ({
    words: toWords(toGlyphs(p, valueFor, page, metrics, missing)),
    // An empty paragraph still takes a line, sized by its own (or the box's first) style.
    emptyStyle: p.runs[0]?.style ?? firstStyle,
  }));

  let scale = 1;
  let overflow = false;
  if (el.fit === "shrink") {
    const natural = Math.max(0, ...paragraphs.map((p) => naturalWidth(p.words)));
    if (natural > boxW) {
      scale = Math.max(MIN_SHRINK, boxW / natural);
      overflow = natural * scale > boxW + 0.01;
    }
  }

  const lines: LaidLine[] = [];
  let cursor = 0; // top of the next line box, relative to the block top
  for (const p of paragraphs) {
    for (const words of fillLines(p.words, el.fit === "wrap" ? boxW : null, scale)) {
      const glyphs = words.flatMap((w) => w.glyphs);
      let end = glyphs.length;
      while (end > 0 && glyphs[end - 1].space) end--; // no trailing spaces at line end
      const drawn = glyphs.slice(0, end);

      const sized = drawn.length
        ? drawn.map((g) => ({ style: g.style, face: g.face }))
        : p.emptyStyle
          ? [{ style: p.emptyStyle, face: faceFor(p.emptyStyle.font, p.emptyStyle.bold, p.emptyStyle.italic) }]
          : [];
      let ascent = 0;
      let descent = 0;
      let maxSize = 0;
      for (const { style, face } of sized) {
        const m = metrics[face];
        const size = (style.sizePct / 100) * page.heightPx * scale;
        maxSize = Math.max(maxSize, size);
        ascent = Math.max(ascent, (m.ascent / m.unitsPerEm) * size);
        descent = Math.max(descent, (-m.descent / m.unitsPerEm) * size);
      }
      const lineBox = maxSize * el.lineHeight;
      const baseline = cursor + (lineBox - (ascent + descent)) / 2 + ascent;
      cursor += lineBox;

      const width = drawn.reduce((sum, g) => sum + g.advance * scale, 0);
      let x =
        el.align === "center" ? boxLeft + (boxW - width) / 2 : el.align === "right" ? boxLeft + boxW - width : boxLeft;

      const runs: LaidRun[] = [];
      const runStyles: Style[] = [];
      for (const g of drawn) {
        const adv = g.advance * scale;
        const i = runs.length - 1;
        if (i >= 0 && sameStyle(runStyles[i], g.style)) {
          runs[i].text += g.ch;
          runs[i].width += adv;
        } else {
          const m = metrics[g.face];
          const size = (g.style.sizePct / 100) * page.heightPx * scale;
          runs.push({
            x,
            width: adv,
            text: g.ch,
            face: g.face,
            family: g.style.font,
            bold: g.style.bold,
            italic: g.style.italic,
            size,
            color: g.style.color,
            underline: g.style.underline
              ? {
                  y: -(m.underlinePosition / m.unitsPerEm) * size, // offset below baseline; made absolute below
                  thickness: (m.underlineThickness / m.unitsPerEm) * size,
                }
              : null,
          });
          runStyles.push(g.style);
        }
        x += adv;
      }
      lines.push({ baseline, width, runs });
    }
  }

  const height = cursor;
  const top = el.fit === "shrink" ? boxTop + (boxH - height) / 2 : boxTop;
  for (const line of lines) {
    line.baseline += top;
    for (const run of line.runs) {
      if (run.underline) run.underline.y = line.baseline + run.underline.y - run.underline.thickness / 2;
    }
  }
  if (el.fit === "wrap" && top + height > page.heightPx + 0.5) overflow = true;

  return { lines, left: boxLeft, top, width: boxW, height, scale, overflow, missingGlyphs: [...missing] };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/certificates/layout.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/certificates/layout.ts src/lib/certificates/layout.test.ts
git commit -m "feat(certificates): shared rich-text layout engine (wrap, shrink, mixed runs)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Rich-text bridge for the in-place editor

**Files:**
- Create: `src/lib/certificates/rich-text.ts`
- Test: `src/lib/certificates/rich-text.test.ts`

**Interfaces:**
- Consumes: `cssFamily`, `familyFromCss`, `hasVariant` (Task 1); `LIMITS`, `Design`, `FieldTransform`, `Paragraph`, `Run`, `Style`, `emptyDesign`, `DEFAULT_STYLE`, `TextElement` (Task 2).
- Produces:
  - Types: `PMMark`, `PMNode`, `FieldRunRef`
  - `FIELD_NODE = "certField"`
  - Conversions: `paragraphsToDoc(paragraphs, pageHeightPx): PMNode`, `docToParagraphs(doc, pageHeightPx, fallback: Style): Paragraph[]`
  - Box helpers: `primaryStyle(paragraphs, fallback)`, `applyStyleToAll(paragraphs, patch)`, `listFieldRuns(paragraphs)`, `setFieldTransform(paragraphs, ref, transform)`
  - Stale fields: `replaceUnknownFields(paragraphs, known, label)`, `designWithUnknownFieldsAsText(design, known, label)`

- [ ] **Step 1: Write the failing test**

`src/lib/certificates/rich-text.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { DEFAULT_STYLE, emptyDesign, type Paragraph, type Style, type TextElement } from "./design";
import {
  applyStyleToAll,
  docToParagraphs,
  listFieldRuns,
  paragraphsToDoc,
  primaryStyle,
  replaceUnknownFields,
  designWithUnknownFieldsAsText,
  setFieldTransform,
  type PMNode,
} from "./rich-text";

const PAGE_H = 2000;
const bold: Style = { ...DEFAULT_STYLE, bold: true, sizePct: 6, color: "#aa0000", font: "lora" };

const sample: Paragraph[] = [
  {
    runs: [
      { kind: "text", text: "This is to certify that ", style: DEFAULT_STYLE },
      { kind: "field", field: "person.name", transform: "title", style: bold },
      { kind: "text", text: ".", style: DEFAULT_STYLE },
    ],
  },
  { runs: [] },
  { runs: [{ kind: "text", text: "Second", style: { ...DEFAULT_STYLE, italic: true, underline: true } }] },
];

describe("paragraphsToDoc / docToParagraphs", () => {
  it("round-trips text, fields, empty paragraphs and styles", () => {
    const doc = paragraphsToDoc(sample, PAGE_H);
    expect(docToParagraphs(doc, PAGE_H, DEFAULT_STYLE)).toEqual(sample);
  });

  it("encodes styles as TipTap marks in page px", () => {
    const doc = paragraphsToDoc(sample, PAGE_H);
    const field = doc.content![0].content![1];
    expect(field).toEqual({
      type: "certField",
      attrs: { field: "person.name", transform: "title" },
      marks: [{ type: "bold" }, { type: "textStyle", attrs: { fontFamily: "cert-lora", fontSize: "120px", color: "#aa0000" } }],
    });
    expect(doc.content![1]).toEqual({ type: "paragraph" });
  });

  it("merges adjacent same-style text and lets unstyled text inherit", () => {
    const doc: PMNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hello ", marks: [{ type: "textStyle", attrs: { fontFamily: "cert-cinzel", fontSize: "100px", color: "rgb(255, 0, 0)" } }] },
            { type: "text", text: "world", marks: [{ type: "textStyle", attrs: { fontFamily: "cert-cinzel", fontSize: "100px", color: "#f00" } }] },
          ],
        },
      ],
    };
    expect(docToParagraphs(doc, 1000, DEFAULT_STYLE)).toEqual([
      { runs: [{ kind: "text", text: "Hello world", style: { ...DEFAULT_STYLE, font: "cinzel", sizePct: 10, color: "#ff0000" } }] },
    ]);
  });

  it("drops a bold/italic the family cannot draw", () => {
    const doc: PMNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Name", marks: [{ type: "bold" }, { type: "italic" }, { type: "textStyle", attrs: { fontFamily: "cert-cinzel" } }] }],
        },
      ],
    };
    const [p] = docToParagraphs(doc, 1000, DEFAULT_STYLE);
    expect(p.runs[0].style).toMatchObject({ font: "cinzel", bold: true, italic: false });
  });

  it("splits on hard breaks and returns one empty paragraph for an empty doc", () => {
    const doc: PMNode = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "a" }, { type: "hardBreak" }, { type: "text", text: "b" }] }],
    };
    expect(docToParagraphs(doc, 1000, DEFAULT_STYLE).map((p) => p.runs.length)).toEqual([1, 1]);
    expect(docToParagraphs({ type: "doc" }, 1000, DEFAULT_STYLE)).toEqual([{ runs: [] }]);
  });
});

describe("whole-box helpers", () => {
  it("applies a style patch to every run, keeping faces valid", () => {
    const out = applyStyleToAll(sample, { font: "greatvibes" });
    for (const r of out.flatMap((p) => p.runs)) {
      expect(r.style.font).toBe("greatvibes");
      expect(r.style.bold || r.style.italic).toBe(false);
    }
    expect(primaryStyle(out, DEFAULT_STYLE).font).toBe("greatvibes");
    expect(primaryStyle([{ runs: [] }], bold)).toBe(bold);
  });

  it("lists field runs and changes one's transform", () => {
    const refs = listFieldRuns(sample);
    expect(refs).toEqual([{ paragraph: 0, run: 1, field: "person.name", transform: "title" }]);
    const out = setFieldTransform(sample, refs[0], "upper");
    expect(listFieldRuns(out)[0].transform).toBe("upper");
    expect(sample[0].runs[1]).toMatchObject({ transform: "title" }); // input untouched
  });

  it("turns unknown fields into visible placeholder text", () => {
    const out = replaceUnknownFields(sample, (k) => k !== "person.name", () => "Name");
    expect(out[0].runs[1]).toEqual({ kind: "text", text: "{Name}", style: bold });
  });

  it("does it for a whole design", () => {
    const el: TextElement = { id: "t", name: "T", type: "text", x: 0, y: 0, w: 10, h: 10, locked: false, hidden: false, align: "left", lineHeight: 1, fit: "wrap", paragraphs: sample };
    const out = designWithUnknownFieldsAsText({ ...emptyDesign(), elements: [el] }, () => false, (k) => k);
    expect(listFieldRuns((out.elements[0] as TextElement).paragraphs)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/certificates/rich-text.test.ts`
Expected: FAIL — `Failed to resolve import "./rich-text"`.

- [ ] **Step 3: Implement**

`src/lib/certificates/rich-text.ts`:

```ts
import { cssFamily, familyFromCss, hasVariant } from "./fonts";
import { LIMITS, type Design, type FieldTransform, type Paragraph, type Run, type Style } from "./design";

/**
 * Pure conversions between a text element's `Paragraph[]` and the TipTap
 * (ProseMirror) JSON the in-place editor works on (spec §6.3), plus the
 * whole-box style helpers the properties panel uses. No TipTap import here —
 * only its JSON shape — so this stays unit-testable.
 *
 * Inside the editor, sizes are CSS px in PAGE pixels (the overlay sits in the
 * page-scaled container), fonts are the `cert-<id>` CSS families.
 */

export interface PMMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface PMNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: PMMark[];
  content?: PMNode[];
}

export const FIELD_NODE = "certField";

const round2 = (n: number) => Math.round(n * 100) / 100;

function marksFor(style: Style, pageHeightPx: number): PMMark[] {
  const marks: PMMark[] = [];
  if (style.bold) marks.push({ type: "bold" });
  if (style.italic) marks.push({ type: "italic" });
  if (style.underline) marks.push({ type: "underline" });
  marks.push({
    type: "textStyle",
    attrs: {
      fontFamily: cssFamily(style.font),
      fontSize: `${round2((style.sizePct / 100) * pageHeightPx)}px`,
      color: style.color,
    },
  });
  return marks;
}

export function paragraphsToDoc(paragraphs: Paragraph[], pageHeightPx: number): PMNode {
  return {
    type: "doc",
    content: paragraphs.map((p) => {
      const content: PMNode[] = [];
      for (const run of p.runs) {
        const marks = marksFor(run.style, pageHeightPx);
        if (run.kind === "text") {
          if (run.text) content.push({ type: "text", text: run.text, marks });
        } else {
          content.push({ type: FIELD_NODE, attrs: { field: run.field, transform: run.transform }, marks });
        }
      }
      return content.length ? { type: "paragraph", content } : { type: "paragraph" };
    }),
  };
}

function toHex(color: unknown): string | null {
  if (typeof color !== "string") return null;
  const c = color.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(c)) return c;
  if (/^#[0-9a-f]{3}$/.test(c)) return `#${[...c.slice(1)].map((d) => d + d).join("")}`;
  const m = c.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return `#${m.slice(1, 4).map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0")).join("")}`;
  return null;
}

function styleFrom(marks: PMMark[] | undefined, pageHeightPx: number, inherit: Style): Style {
  const has = (t: string) => !!marks?.some((m) => m.type === t);
  const ts = marks?.find((m) => m.type === "textStyle")?.attrs ?? {};
  const font = typeof ts.fontFamily === "string" ? (familyFromCss(ts.fontFamily) ?? inherit.font) : inherit.font;
  const px = typeof ts.fontSize === "string" ? parseFloat(ts.fontSize) : NaN;
  const sizePct = Number.isFinite(px)
    ? Math.min(LIMITS.sizePct[1], Math.max(LIMITS.sizePct[0], round2((px / pageHeightPx) * 100)))
    : inherit.sizePct;
  let bold = has("bold");
  let italic = has("italic");
  // Never emit a face the family lacks (validation would reject the save).
  if (!hasVariant(font, bold, italic)) {
    if (hasVariant(font, bold, false)) italic = false;
    else if (hasVariant(font, false, italic)) bold = false;
    else {
      bold = false;
      italic = false;
    }
  }
  return {
    font,
    sizePct,
    bold,
    italic,
    underline: has("underline"),
    color: toHex(ts.color) ?? inherit.color,
  };
}

const sameStyle = (a: Style, b: Style) =>
  a.font === b.font &&
  a.sizePct === b.sizePct &&
  a.bold === b.bold &&
  a.italic === b.italic &&
  a.underline === b.underline &&
  a.color === b.color;

/**
 * Editor JSON → paragraphs. Unstyled text inherits the previous run's style
 * (or `fallback`); adjacent text runs with identical styles merge.
 */
export function docToParagraphs(doc: PMNode, pageHeightPx: number, fallback: Style): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let inherit = fallback;
  for (const block of doc.content ?? []) {
    if (block.type !== "paragraph") continue;
    let runs: Run[] = [];
    for (const node of block.content ?? []) {
      if (node.type === "hardBreak") {
        paragraphs.push({ runs });
        runs = [];
        continue;
      }
      const style = styleFrom(node.marks, pageHeightPx, inherit);
      inherit = style;
      if (node.type === "text" && node.text) {
        const last = runs[runs.length - 1];
        if (last?.kind === "text" && sameStyle(last.style, style)) last.text += node.text;
        else runs.push({ kind: "text", text: node.text, style });
      } else if (node.type === FIELD_NODE && typeof node.attrs?.field === "string") {
        const t = node.attrs.transform;
        const transform: FieldTransform = t === "title" || t === "upper" ? t : "none";
        runs.push({ kind: "field", field: node.attrs.field, transform, style });
      }
    }
    paragraphs.push({ runs });
  }
  return paragraphs.length ? paragraphs : [{ runs: [] }];
}

// ── whole-box helpers (properties panel, not editing) ────────────────────────

/** The style shown in the panel for a box: its first run's, else the default. */
export function primaryStyle(paragraphs: Paragraph[], fallback: Style): Style {
  return paragraphs.flatMap((p) => p.runs)[0]?.style ?? fallback;
}

/** Apply a style change to every run in the box, keeping faces valid. */
export function applyStyleToAll(paragraphs: Paragraph[], patch: Partial<Style>): Paragraph[] {
  return paragraphs.map((p) => ({
    runs: p.runs.map((r) => {
      const next = { ...r.style, ...patch };
      if (!hasVariant(next.font, next.bold, next.italic)) {
        next.bold = hasVariant(next.font, next.bold, false) ? next.bold : false;
        next.italic = hasVariant(next.font, next.bold, next.italic) ? next.italic : false;
      }
      return { ...r, style: next };
    }),
  }));
}

export interface FieldRunRef {
  paragraph: number;
  run: number;
  field: string;
  transform: FieldTransform;
}

export function listFieldRuns(paragraphs: Paragraph[]): FieldRunRef[] {
  const out: FieldRunRef[] = [];
  paragraphs.forEach((p, pi) =>
    p.runs.forEach((r, ri) => {
      if (r.kind === "field") out.push({ paragraph: pi, run: ri, field: r.field, transform: r.transform });
    }),
  );
  return out;
}

export function setFieldTransform(
  paragraphs: Paragraph[],
  ref: { paragraph: number; run: number },
  transform: FieldTransform,
): Paragraph[] {
  return paragraphs.map((p, pi) =>
    pi !== ref.paragraph
      ? p
      : { runs: p.runs.map((r, ri) => (ri === ref.run && r.kind === "field" ? { ...r, transform } : r)) },
  );
}

/** Replace field runs the design context no longer knows with visible text, e.g. "{Project title}". */
export function replaceUnknownFields(
  paragraphs: Paragraph[],
  known: (key: string) => boolean,
  label: (key: string) => string,
): Paragraph[] {
  return paragraphs.map((p) => ({
    runs: p.runs.map((r): Run =>
      r.kind === "field" && !known(r.field) ? { kind: "text", text: `{${label(r.field)}}`, style: r.style } : r,
    ),
  }));
}

/** replaceUnknownFields across every text element of a design. */
export function designWithUnknownFieldsAsText(
  design: Design,
  known: (key: string) => boolean,
  label: (key: string) => string,
): Design {
  return {
    ...design,
    elements: design.elements.map((el) =>
      el.type === "text" ? { ...el, paragraphs: replaceUnknownFields(el.paragraphs, known, label) } : el,
    ),
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/certificates/rich-text.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/certificates/rich-text.ts src/lib/certificates/rich-text.test.ts
git commit -m "feat(certificates): TipTap JSON <-> paragraph conversion and box style helpers

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: PDF renderer

**Files:**
- Replace: `src/lib/certificates/render.ts` (v1's `renderCertificatePdf` is removed)
- Replace: `src/lib/certificates/render.test.ts`
- Create: `src/lib/certificates/font-files.ts`, `src/lib/certificates/font-embedding.test.ts`

**Interfaces:**
- Consumes: `AssetRef`, `Design`, `DEFAULT_STYLE`, `emptyDesign` (Task 2); `FaceId`, `ALL_FACES`, `faceFile` (Task 1); `layoutText` (Task 4); `METRICS`, `NO_FEATURES` (Task 1).
- Produces:
  - `PAGE_LONG_EDGE_PT = 842`
  - `interface RenderInput { design; pages: { valueFor }[]; loadAsset(ref): Promise<Uint8Array>; loadFont(face): Promise<Uint8Array>; watermark?; title? }`
  - `renderCertificatesPdf(input): Promise<Uint8Array>`
  - `loadFontFile(face: FaceId): Promise<Uint8Array>` (server-only, cached)

- [ ] **Step 1: Replace the test**

`src/lib/certificates/render.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { renderCertificatesPdf, PAGE_LONG_EDGE_PT } from "./render";
import { DEFAULT_STYLE, emptyDesign, type Design } from "./design";
import { faceFile, type FaceId } from "./fonts";

// 1×1 PNG — enough to exercise embedding.
const PNG = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  ),
);
const loadFont = (face: FaceId) => readFile(path.join(process.cwd(), "public", "fonts", "cert", faceFile(face)));
const isPdf = (b: Uint8Array) => Buffer.from(b.slice(0, 5)).toString("latin1") === "%PDF-";
const asset = (p: string) => ({ bucket: "certificate-assets" as const, path: p, type: "png" as const, widthPx: 1, heightPx: 1 });

function design(): Design {
  const d = emptyDesign(); // 3508 × 2480
  d.page.template = asset("template");
  d.elements = [
    { id: "logo", name: "Logo", type: "image", x: 5, y: 5, w: 10, h: 10, locked: false, hidden: false, opacity: 0.8, asset: asset("logo") },
    {
      id: "body",
      name: "Body",
      type: "text",
      x: 10,
      y: 40,
      w: 80,
      h: 10,
      locked: false,
      hidden: false,
      align: "center",
      lineHeight: 1.3,
      fit: "wrap",
      paragraphs: [
        {
          runs: [
            { kind: "text", text: "This is to certify that ", style: DEFAULT_STYLE },
            { kind: "field", field: "person.name", transform: "title", style: { ...DEFAULT_STYLE, bold: true, underline: true } },
          ],
        },
      ],
    },
  ];
  return d;
}

describe("renderCertificatesPdf", () => {
  it("renders one A4-sized page per recipient and embeds shared images once", async () => {
    const loads: string[] = [];
    const bytes = await renderCertificatesPdf({
      design: design(),
      pages: [{ valueFor: () => "asha r" }, { valueFor: () => "ravi k" }],
      loadAsset: async (ref) => {
        loads.push(ref.path);
        return PNG;
      },
      loadFont,
      title: "Certificates",
    });
    expect(isPdf(bytes)).toBe(true);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(PAGE_LONG_EDGE_PT, 5);
    expect(height).toBeCloseTo((2480 / 3508) * PAGE_LONG_EDGE_PT, 5);
    expect(loads.sort()).toEqual(["logo", "template"]);
  });

  it("renders a watermark and skips hidden elements", async () => {
    const d = design();
    d.elements[0].hidden = true;
    const loads: string[] = [];
    const bytes = await renderCertificatesPdf({
      design: d,
      pages: [{ valueFor: () => "" }],
      loadAsset: async (ref) => {
        loads.push(ref.path);
        return PNG;
      },
      loadFont,
      watermark: "PREVIEW",
    });
    expect(isPdf(bytes)).toBe(true);
    expect(loads).toEqual(["template"]);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/certificates/render.test.ts`
Expected: FAIL — `renderCertificatesPdf` / `PAGE_LONG_EDGE_PT` is not exported by `./render`.

- [ ] **Step 3: Replace the renderer and add the font loader**

`src/lib/certificates/render.ts`:

```ts
import "server-only";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFImage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { AssetRef, Design } from "./design";
import { needsFullEmbed, type FaceId } from "./fonts";
import { layoutText } from "./layout";
import { METRICS } from "./metrics";
import { NO_FEATURES } from "./pdf-features";

/**
 * Draw certificates as a PDF (spec §6.5): one page per entry in `pages`, each
 * the same design with its own field values. Text comes from the shared layout
 * engine, so it lands exactly where the editor showed it. Assets and fonts are
 * embedded once per document and shared by every page.
 *
 * I/O is injected (`loadAsset`, `loadFont`) so this stays testable and the
 * caller controls caching.
 */

/** The PDF page's long edge in points — A4 (842 × 595 pt) for an A4-shaped template. */
export const PAGE_LONG_EDGE_PT = 842;

export interface RenderInput {
  design: Design;
  pages: { valueFor: (field: string) => string }[];
  loadAsset: (ref: AssetRef) => Promise<Uint8Array>;
  loadFont: (face: FaceId) => Promise<Uint8Array>;
  /** Diagonal watermark text, e.g. "PREVIEW". */
  watermark?: string;
  title?: string;
}

const rgbHex = (hex: string) =>
  rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);

export async function renderCertificatesPdf(input: RenderInput): Promise<Uint8Array> {
  const { design } = input;
  const W = design.page.widthPx;
  const H = design.page.heightPx;
  const k = PAGE_LONG_EDGE_PT / Math.max(W, H); // page px → pt
  const pageW = W * k;
  const pageH = H * k;

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setProducer("CSE Club Council");
  pdf.setCreator("CSE Club Council certificates");
  if (input.title) pdf.setTitle(input.title);

  const images = new Map<string, Promise<PDFImage>>();
  const image = (ref: AssetRef) => {
    const key = `${ref.bucket}/${ref.path}`;
    let p = images.get(key);
    if (!p) {
      p = input.loadAsset(ref).then((bytes) => (ref.type === "png" ? pdf.embedPng(bytes) : pdf.embedJpg(bytes)));
      images.set(key, p);
    }
    return p;
  };
  const fonts = new Map<FaceId, Promise<PDFFont>>();
  const font = (face: FaceId) => {
    let p = fonts.get(face);
    if (!p) {
      p = input
        .loadFont(face)
        .then((bytes) => pdf.embedFont(bytes, { subset: !needsFullEmbed(face), features: NO_FEATURES }));
      fonts.set(face, p);
    }
    return p;
  };

  for (const { valueFor } of input.pages) {
    const page = pdf.addPage([pageW, pageH]);
    if (design.page.template) {
      page.drawImage(await image(design.page.template), { x: 0, y: 0, width: pageW, height: pageH });
    }
    for (const el of design.elements) {
      if (el.hidden) continue;
      if (el.type === "image") {
        const w = (el.w / 100) * W * k;
        const h = (el.h / 100) * H * k;
        page.drawImage(await image(el.asset), {
          x: (el.x / 100) * W * k,
          y: pageH - (el.y / 100) * H * k - h,
          width: w,
          height: h,
          opacity: el.opacity,
        });
        continue;
      }
      const layout = layoutText(el, valueFor, design.page, METRICS);
      for (const line of layout.lines) {
        for (const run of line.runs) {
          const color = rgbHex(run.color);
          page.drawText(run.text, {
            x: run.x * k,
            y: pageH - line.baseline * k,
            size: run.size * k,
            font: await font(run.face),
            color,
          });
          if (run.underline) {
            page.drawRectangle({
              x: run.x * k,
              y: pageH - (run.underline.y + run.underline.thickness) * k,
              width: run.width * k,
              height: run.underline.thickness * k,
              color,
            });
          }
        }
      }
    }
    if (input.watermark) {
      const helv = await pdf.embedFont(StandardFonts.HelveticaBold);
      const size = pageH / 5;
      const width = helv.widthOfTextAtSize(input.watermark, size);
      page.drawText(input.watermark, {
        x: pageW / 2 - (width / 2) * Math.cos(Math.PI / 6),
        y: pageH / 2 - (width / 2) * Math.sin(Math.PI / 6),
        size,
        font: helv,
        color: rgb(0.8, 0.1, 0.1),
        opacity: 0.12,
        rotate: degrees(30),
      });
    }
  }
  return pdf.save();
}
```

`src/lib/certificates/font-files.ts`:

```ts
import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { faceFile, type FaceId } from "./fonts";

/**
 * The bundled TTFs, read from public/fonts/cert — the same files the editor
 * loads with @font-face. next.config.ts traces them into the certificate
 * routes (outputFileTracingIncludes) so they exist inside the Vercel function.
 */
const cache = new Map<FaceId, Promise<Uint8Array>>();

export function loadFontFile(face: FaceId): Promise<Uint8Array> {
  let pending = cache.get(face);
  if (!pending) {
    pending = readFile(path.join(process.cwd(), "public", "fonts", "cert", faceFile(face))).then((b) => new Uint8Array(b));
    pending.catch(() => cache.delete(face));
    cache.set(face, pending);
  }
  return pending;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/certificates/render.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Prove every glyph survives embedding (spec §6.5 risk)**

`pdf-lib`'s subsetter writes an undecodable `glyf` table for some fonts — plain letters included, not only accents — so `fonts.ts` lists the faces that must be embedded whole (`FULL_EMBED_FACES`). This test keeps that list honest: for each face it renders a sample, pulls the embedded font program back out of the PDF, and decodes every glyph id the page draws.

`src/lib/certificates/font-embedding.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import path from "node:path";
import { PDFDocument, PDFDict, PDFName, PDFRawStream } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { ALL_FACES, faceFile, type FaceId, type FontFamilyId, type FaceVariant } from "./fonts";
import { DEFAULT_STYLE, emptyDesign, type Design } from "./design";
import { renderCertificatesPdf } from "./render";

/**
 * Every glyph we draw must survive into the PDF.
 *
 * pdf-lib's font subsetting writes an undecodable `glyf` table for some fonts,
 * which prints as blank or garbled text — and it hits plain letters, not only
 * accented ones. `FULL_EMBED_FACES` lists the faces that must therefore go in
 * whole. This test is what keeps that list honest: for each bundled face it
 * renders a sample, pulls the embedded font program back out of the PDF, and
 * decodes every glyph id the page actually draws. It is also the gate on adding
 * or updating a font.
 */

// No spaces: the space is the one glyph that legitimately has no outline, and a
// subset font's cmap may not identify it, so leaving it out keeps the rule simple —
// every drawn glyph must have outline data.
const SAMPLE = "Thequickbrownfoxjumpsoverthelazydog0123456789ÜnïcodeÀÉÎÕÜàéîõü";
const fontPath = (face: FaceId) => path.join(process.cwd(), "public", "fonts", "cert", faceFile(face));
const loadFont = async (face: FaceId) => new Uint8Array(await readFile(fontPath(face)));

/** A 1×1 PNG stands in for the template. */
const PNG = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  ),
);

function sampleDesign(face: FaceId, text: string): Design {
  const [family, variant] = face.split("-") as [FontFamilyId, FaceVariant];
  const design = emptyDesign();
  design.elements = [
    {
      id: "s",
      name: "Specimen",
      type: "text",
      x: 5,
      y: 20,
      w: 90,
      h: 60,
      locked: false,
      hidden: false,
      align: "left",
      lineHeight: 1.3,
      fit: "wrap",
      paragraphs: [
        {
          runs: [
            {
              kind: "text",
              text,
              style: { ...DEFAULT_STYLE, font: family, bold: variant.includes("b"), italic: variant.includes("i"), sizePct: 4 },
            },
          ],
        },
      ],
    },
  ];
  return design;
}

const decodeStream = (stream: PDFRawStream): Buffer => {
  const raw = Buffer.from(stream.getContents());
  return String(stream.dict.get(PDFName.of("Filter"))) === "/FlateDecode" ? inflateSync(raw) : raw;
};

/** The embedded font program plus every glyph id the page draws. */
async function readBackFont(pdfBytes: Uint8Array) {
  const pdf = await PDFDocument.load(pdfBytes);
  let fontBytes: Buffer | null = null;
  const contents: Buffer[] = [];
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFDict) {
      const ref = obj.get(PDFName.of("FontFile2"));
      if (ref) fontBytes = decodeStream(pdf.context.lookup(ref) as PDFRawStream);
    }
    if (obj instanceof PDFRawStream && obj.dict.get(PDFName.of("FontFile2")) === undefined) {
      try {
        contents.push(decodeStream(obj));
      } catch {
        // not a stream we can read; it is not the content stream either
      }
    }
  }
  const gids = new Set<number>();
  for (const stream of contents) {
    for (const match of stream.toString("latin1").matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
      const hex = match[1];
      for (let i = 0; i + 4 <= hex.length; i += 4) gids.add(parseInt(hex.slice(i, i + 4), 16));
    }
  }
  return { fontBytes, gids };
}

describe("embedded fonts", () => {
  it.each(ALL_FACES)("%s: every drawn glyph decodes out of the PDF", async (face) => {
    const source = fontkit.create(Buffer.from(await loadFont(face)));
    const text = [...SAMPLE].filter((ch) => source.hasGlyphForCodePoint(ch.codePointAt(0)!)).join("");
    expect(text.length).toBeGreaterThan(40);

    const pdfBytes = await renderCertificatesPdf({
      design: sampleDesign(face, text),
      pages: [{ valueFor: () => "" }],
      loadAsset: async () => PNG,
      loadFont,
    });

    const { fontBytes, gids } = await readBackFont(pdfBytes);
    expect(fontBytes, "no font program embedded").not.toBeNull();
    expect(gids.size).toBeGreaterThan(20);

    const embedded = fontkit.create(fontBytes!);
    const broken: number[] = [];
    for (const gid of gids) {
      if (gid === 0 || gid >= embedded.numGlyphs) {
        broken.push(gid);
        continue;
      }
      try {
        const glyph = embedded.getGlyph(gid);
        // A glyph with no outline is only legitimate for the space.
        if (glyph.path.commands.length === 0 && glyph.advanceWidth > 0 && glyph.codePoints?.[0] !== 32) broken.push(gid);
      } catch {
        broken.push(gid);
      }
    }
    expect(broken, `${face} has ${broken.length} unusable glyphs — add it to FULL_EMBED_FACES`).toEqual([]);
  }, 20_000);
});
```

Run: `npx vitest run src/lib/certificates/font-embedding.test.ts`
Expected: PASS, 24 tests.

Sanity-check the test itself: temporarily empty `FULL_EMBED_FACES` in `fonts.ts` and re-run — `poppins-i`, `poppins-bi` and `greatvibes-r` must fail with "unusable glyphs". Restore the set afterwards.

- [ ] **Step 6: Commit**

```bash
git add src/lib/certificates/render.ts src/lib/certificates/render.test.ts src/lib/certificates/font-files.ts src/lib/certificates/font-embedding.test.ts
git commit -m "feat(certificates): render designs to A4-sized multi-page PDFs via the shared layout

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Database migration and generated types

**Files:**
- Create: `supabase/migrations/20260914020000_certificate_designer.sql`
- Regenerate: `src/lib/database.types.ts`

**Interfaces:**
- Produces:
  - Tables: `certificate_groups`, `certificate_design_versions`, `certificate_sheet_rows`
  - New `certificates` columns: `group_id`, `design_version_id`, `recipient_key`, `recipient_name`, `recipient_email`, `snapshot`, `superseded_by`
  - Index: `certificates_one_live_per_recipient`
  - RPCs (phase 2 callers): `replace_certificate_sheet_rows`, `supersede_certificate`, `undo_supersede`
  - Bucket: `certificate-assets`

- [ ] **Step 1: Write the migration file**

`supabase/migrations/20260914020000_certificate_designer.sql`:

```sql
-- Certificate designer (docs/superpowers/specs/2026-09-14-certificate-designer-design.md §4).
-- Additive and backwards-safe. Apply through the Supabase MCP `apply_migration`
-- tool — NEVER `supabase db push` on this project (see docs/STATUS.md).
--
-- Adds recipient groups with a working design each, immutable design versions,
-- uploaded sheet rows (used from phase 2), recipient snapshot columns on the
-- existing `certificates` ledger, three atomic helpers, and a private bucket for
-- design assets. v1's `events.certificate_template/config` stay untouched; the
-- app converts them into a design the first time an event's page is opened.

do $$ begin
  create type public.certificate_group_kind as enum ('participants', 'sheet');
exception when duplicate_object then null; end $$;

create table if not exists public.certificate_groups (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  kind          public.certificate_group_kind not null,
  name          text not null check (char_length(name) between 1 and 60),
  design        jsonb not null,
  sheet_columns text[] not null default '{}',
  sort          int not null default 0,
  created_by    uuid references public.admin_users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists certificate_groups_event_idx on public.certificate_groups (event_id);
create unique index if not exists certificate_groups_one_participants
  on public.certificate_groups (event_id) where kind = 'participants';

create table if not exists public.certificate_design_versions (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid references public.certificate_groups(id) on delete set null,
  hash       text not null,
  design     jsonb not null,
  created_at timestamptz not null default now(),
  unique (group_id, hash)
);

create table if not exists public.certificate_sheet_rows (
  id       uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.certificate_groups(id) on delete cascade,
  row_no   int not null,
  name     text not null,
  email    text,
  data     jsonb not null default '{}'::jsonb
);
create index if not exists certificate_sheet_rows_group_idx on public.certificate_sheet_rows (group_id);

alter table public.certificates
  add column if not exists group_id          uuid references public.certificate_groups(id) on delete set null,
  add column if not exists design_version_id uuid references public.certificate_design_versions(id),
  add column if not exists recipient_key     text,
  add column if not exists recipient_name    text,
  add column if not exists recipient_email   text,
  add column if not exists snapshot          jsonb,
  add column if not exists superseded_by     uuid references public.certificates(id);

-- Backfill v1 rows: every one is a participation certificate for a registration.
update public.certificates c
   set recipient_key   = 'reg:' || c.registration_id,
       recipient_name  = r.student_name,
       recipient_email = r.email,
       snapshot        = jsonb_build_object(
                           'values', jsonb_build_object('person.name', coalesce(r.student_name, '')),
                           'groupLabel', 'Participation')
  from public.registrations r
 where r.id = c.registration_id
   and c.recipient_key is null;

-- At most one live certificate per recipient per event — makes issuing race-safe.
create unique index if not exists certificates_one_live_per_recipient
  on public.certificates (event_id, recipient_key)
  where revoked_at is null and recipient_key is not null;

-- Same lockdown as `certificates` (20260820120005_rls.sql): service role only.
alter table public.certificate_groups          enable row level security;
alter table public.certificate_design_versions enable row level security;
alter table public.certificate_sheet_rows      enable row level security;
revoke all on public.certificate_groups          from anon, authenticated;
revoke all on public.certificate_design_versions from anon, authenticated;
revoke all on public.certificate_sheet_rows      from anon, authenticated;

-- Replace a sheet group's rows in one transaction (phase 2).
create or replace function public.replace_certificate_sheet_rows(p_group_id uuid, p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  delete from public.certificate_sheet_rows where group_id = p_group_id;
  insert into public.certificate_sheet_rows (group_id, row_no, name, email, data)
  select p_group_id,
         (r->>'row_no')::int,
         r->>'name',
         nullif(r->>'email', ''),
         coalesce(r->'data', '{}'::jsonb)
    from jsonb_array_elements(p_rows) as r;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Retire a live certificate and issue its replacement atomically (phase 2).
-- The old row stops being live before the new one is inserted, so the
-- one-live-per-recipient index never sees two.
create or replace function public.supersede_certificate(p_old_id uuid, p_new jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old    public.certificates;
  v_new_id uuid;
begin
  select * into v_old from public.certificates where id = p_old_id and revoked_at is null for update;
  if not found then
    raise exception 'certificate % is not live', p_old_id using errcode = 'P0002';
  end if;

  update public.certificates
     set revoked_at = now(), revoked_reason = 'superseded'
   where id = p_old_id;

  insert into public.certificates (
    event_id, registration_id, type, placement, serial, hmac, issued_by,
    group_id, design_version_id, recipient_key, recipient_name, recipient_email, snapshot
  ) values (
    v_old.event_id, v_old.registration_id, v_old.type, v_old.placement,
    p_new->>'serial', p_new->>'hmac', nullif(p_new->>'issued_by', '')::uuid,
    nullif(p_new->>'group_id', '')::uuid, nullif(p_new->>'design_version_id', '')::uuid,
    v_old.recipient_key, p_new->>'recipient_name', nullif(p_new->>'recipient_email', ''), p_new->'snapshot'
  )
  returning id into v_new_id;

  update public.certificates set superseded_by = v_new_id where id = p_old_id;
  return v_new_id;
end;
$$;

-- Undo a supersede whose email failed: drop the replacement, make the old row live again.
create or replace function public.undo_supersede(p_new_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_id uuid;
begin
  select id into v_old_id from public.certificates where superseded_by = p_new_id;
  update public.certificates set superseded_by = null where id = v_old_id;
  delete from public.certificates where id = p_new_id;
  update public.certificates set revoked_at = null, revoked_reason = null where id = v_old_id;
end;
$$;

revoke execute on function public.replace_certificate_sheet_rows(uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.replace_certificate_sheet_rows(uuid, jsonb) to service_role;
revoke execute on function public.supersede_certificate(uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.supersede_certificate(uuid, jsonb) to service_role;
revoke execute on function public.undo_supersede(uuid) from public, anon, authenticated;
grant  execute on function public.undo_supersede(uuid) to service_role;

-- Private bucket for design assets (templates, logos, signatures). Storage
-- enforces the size and type caps on signed uploads too. No storage policy:
-- writes go through service-role-minted signed upload URLs, reads through
-- short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('certificate-assets', 'certificate-assets', false, 8388608, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;
```

- [ ] **Step 2: Check the backfill's precondition on the live DB**

Supabase MCP `execute_sql` (project `jisahccdnthzgibszwnq`):

```sql
select
  count(*)                                                            as total,
  count(*) filter (where registration_id is null)                     as without_registration,
  count(*) filter (where revoked_at is null)
    - count(distinct registration_id) filter (where revoked_at is null) as duplicate_live
from public.certificates;
```

Expected: `without_registration = 0` and `duplicate_live = 0`. **If either is non-zero, stop and ask the owner** — the unique index would fail to build.

- [ ] **Step 3: Apply it**

Supabase MCP `apply_migration` with name `certificate_designer` and the file's full SQL as `query`. Expected: success.

- [ ] **Step 4: Verify what landed**

Supabase MCP `execute_sql`:

```sql
select table_name from information_schema.tables
 where table_schema = 'public' and table_name like 'certificate%' order by 1;
select count(*) filter (where recipient_key is null) as unkeyed from public.certificates;
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'certificate-assets';
select has_function_privilege('anon', 'public.supersede_certificate(uuid, jsonb)', 'execute') as anon_can_supersede,
       has_table_privilege('anon', 'public.certificate_groups', 'select')                    as anon_can_read_groups;
```

Expected:
- tables `certificate_design_versions`, `certificate_groups`, `certificate_sheet_rows`, `certificates`
- `unkeyed = 0`
- bucket row `certificate-assets | false | 8388608 | {image/png,image/jpeg}`
- both privileges `false`

Then run MCP `get_advisors` (type `security`) and confirm no new warnings name these tables or functions.

- [ ] **Step 5: Regenerate the types**

Call Supabase MCP `generate_typescript_types` and write its output to `src/lib/database.types.ts`. Then:

```bash
git diff --stat src/lib/database.types.ts
grep -c "certificate_groups\|certificate_design_versions\|certificate_sheet_rows\|supersede_certificate\|certificate_group_kind" src/lib/database.types.ts
```

Expected: the grep count is > 0. Review `git diff src/lib/database.types.ts`: it should only add the new tables, columns, functions and enum. If it also rewrites unrelated tables, keep the regenerated file anyway (it reflects the live schema) and note that in the commit message.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260914020000_certificate_designer.sql src/lib/database.types.ts
git commit -m "feat(db): certificate designer schema — groups, design versions, recipient snapshots

Applied to jisahccdnthzgibszwnq via MCP apply_migration.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Recipient status, asset storage helpers and the data layer

**Files:**
- Create: `src/lib/certificates/recipients.ts`, `src/lib/certificates/assets.ts`
- Replace: `src/lib/admin/certificates.ts`
- Test: `src/lib/certificates/recipients.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 3, 5 exports; `createAdminClient`; `canManage`, `AdminIdentity`; `istDateMedium`; `getEventFormSchema`, `listRegistrations`; `validateCertificateConfig`.
- Produces:
  - `recipients.ts`:
    - Types: `Recipient { key; registrationId; name; email; values; status }`, `RecipientStatus`, `CertificateLedgerRow`, `IssueMode = "email" | "record"`, `RecipientCounts`
    - `registrationKey(id)`, `statusByKey(rows)`, `pendingRecipients(recipients, mode)`, `countRecipients(recipients)`, `certificateFileName(name, eventTitle)`
  - `assets.ts`: `signAssetUrls(refs)`, `assetLoader()`, `verifyNewAssets(eventId, next, previous, load?)`
  - `admin/certificates.ts`:
    - `PARTICIPATION_LABEL`
    - Types: `CertEvent`, `CertificateGroup`, `CertificateWorkspace { event; group; editableDesign; catalogue; recipients; counts; assetUrls }`, `CertificateEventRow`
    - Loaders: `getCertEvent(eventId)`, `getGroup(eventId, groupId)`, `getParticipantsGroup(eventId)`, `ensureParticipantsGroup(eventId, actorId)`, `listParticipantRecipients(event)`, `getCertificateWorkspace(eventId, actorId)`
    - `ensureDesignVersion(groupId, design)`, `listDesignSources(identity, eventId)`, `listCertificateEvents()`

- [ ] **Step 1: Write the failing test**

`src/lib/certificates/recipients.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  certificateFileName,
  countRecipients,
  pendingRecipients,
  registrationKey,
  statusByKey,
  type CertificateLedgerRow,
  type Recipient,
} from "./recipients";

const row = (over: Partial<CertificateLedgerRow>): CertificateLedgerRow => ({
  id: "c1",
  recipient_key: "reg:1",
  serial: "CSE-1",
  issued_at: "2026-09-01T10:00:00Z",
  revoked_at: null,
  revoked_reason: null,
  ...over,
});

describe("statusByKey", () => {
  it("marks a live row as issued", () => {
    expect(statusByKey([row({})]).get("reg:1")).toEqual({
      state: "issued",
      certificateId: "c1",
      serial: "CSE-1",
      issuedAt: "2026-09-01T10:00:00Z",
    });
  });

  it("treats a superseded row with a live successor as issued", () => {
    const s = statusByKey([
      row({ id: "old", revoked_at: "2026-09-02T00:00:00Z", revoked_reason: "superseded" }),
      row({ id: "new", serial: "CSE-2", issued_at: "2026-09-02T00:00:00Z" }),
    ]);
    expect(s.get("reg:1")).toMatchObject({ state: "issued", certificateId: "new" });
  });

  it("marks a standalone revoke as revoked", () => {
    const s = statusByKey([row({ revoked_at: "2026-09-03T00:00:00Z", revoked_reason: "Did not attend" })]);
    expect(s.get("reg:1")).toEqual({ state: "revoked", revokedAt: "2026-09-03T00:00:00Z" });
  });

  it("ignores rows without a recipient key", () => {
    expect(statusByKey([row({ recipient_key: null })]).size).toBe(0);
  });
});

describe("pending + counts", () => {
  const r = (key: string, email: string | null, status: Recipient["status"]): Recipient => ({
    key,
    registrationId: key,
    name: key,
    email,
    values: {},
    status,
  });
  const list = [
    r("a", "a@x", { state: "pending" }),
    r("b", null, { state: "pending" }),
    r("c", "c@x", { state: "issued", certificateId: "1", serial: "S", issuedAt: "t" }),
    r("d", "d@x", { state: "revoked", revokedAt: "t" }),
  ];

  it("emails only pending recipients with an address; records any pending one", () => {
    expect(pendingRecipients(list, "email").map((x) => x.key)).toEqual(["a"]);
    expect(pendingRecipients(list, "record").map((x) => x.key)).toEqual(["a", "b"]);
  });

  it("counts", () => {
    expect(countRecipients(list)).toEqual({ total: 4, issued: 1, revoked: 1, pendingEmail: 1, noEmail: 1 });
  });

  it("keys registrations", () => {
    expect(registrationKey("abc")).toBe("reg:abc");
  });
});

describe("certificateFileName", () => {
  it("builds a safe, bounded file name", () => {
    expect(certificateFileName("Asha R", "Hack: Night/2026")).toBe("Certificate - Asha R - Hack Night 2026.pdf");
    expect(certificateFileName("", "X")).toBe("Certificate - Participant - X.pdf");
    expect(certificateFileName("a".repeat(300), "X").length).toBeLessThanOrEqual(120);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/certificates/recipients.test.ts`
Expected: FAIL — `Failed to resolve import "./recipients"`.

- [ ] **Step 3: Implement recipients**

`src/lib/certificates/recipients.ts`:

```ts
import type { FieldValues } from "./fields";

/**
 * Who gets a certificate and where each one stands (spec §3, §5). Pure — the
 * data layer loads registrations and ledger rows, this decides status.
 * Phase 1 covers registrations (solo participants and team leaders).
 */

export interface Recipient {
  /** Stable identity across re-issues: "reg:<registrationId>". */
  key: string;
  registrationId: string;
  name: string;
  /** Where the certificate is emailed; null = download only. */
  email: string | null;
  values: FieldValues;
  status: RecipientStatus;
}

export type RecipientStatus =
  | { state: "pending" }
  | { state: "issued"; certificateId: string; serial: string; issuedAt: string }
  | { state: "revoked"; revokedAt: string };

/** The ledger columns status needs. */
export interface CertificateLedgerRow {
  id: string;
  recipient_key: string | null;
  serial: string;
  issued_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
}

export const registrationKey = (registrationId: string) => `reg:${registrationId}`;

/**
 * Status per recipient key. A live row wins; otherwise the most recent
 * standalone revoke (not a supersede — that always has a live successor) makes
 * the recipient "revoked", so bulk issuing leaves them alone.
 */
export function statusByKey(rows: CertificateLedgerRow[]): Map<string, RecipientStatus> {
  const out = new Map<string, RecipientStatus>();
  const sorted = [...rows].sort((a, b) => a.issued_at.localeCompare(b.issued_at));
  for (const row of sorted) {
    if (!row.recipient_key) continue;
    const current = out.get(row.recipient_key);
    if (!row.revoked_at) {
      out.set(row.recipient_key, { state: "issued", certificateId: row.id, serial: row.serial, issuedAt: row.issued_at });
    } else if (row.revoked_reason !== "superseded" && current?.state !== "issued") {
      out.set(row.recipient_key, { state: "revoked", revokedAt: row.revoked_at });
    }
  }
  return out;
}

export type IssueMode = "email" | "record";

/** Recipients the next bulk run should process: not issued, not revoked, and (to email) with an address. */
export function pendingRecipients(recipients: Recipient[], mode: IssueMode): Recipient[] {
  return recipients.filter((r) => r.status.state === "pending" && (mode === "record" || !!r.email));
}

export interface RecipientCounts {
  total: number;
  issued: number;
  revoked: number;
  pendingEmail: number;
  noEmail: number;
}

export function countRecipients(recipients: Recipient[]): RecipientCounts {
  return {
    total: recipients.length,
    issued: recipients.filter((r) => r.status.state === "issued").length,
    revoked: recipients.filter((r) => r.status.state === "revoked").length,
    pendingEmail: pendingRecipients(recipients, "email").length,
    noEmail: recipients.filter((r) => r.status.state === "pending" && !r.email).length,
  };
}

/** "Certificate - Asha R - Hack Night.pdf", safe as an attachment or ZIP entry name. */
export function certificateFileName(name: string, eventTitle: string): string {
  const base = `Certificate - ${name.trim() || "Participant"} - ${eventTitle.trim()}`
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\x00-\x1f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 116)
    .trim();
  return `${base}.pdf`;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/certificates/recipients.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Add the storage helpers**

`src/lib/certificates/assets.ts`:

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  assetKey,
  assetRefsOf,
  CERT_ASSET_BUCKET,
  LEGACY_TEMPLATE_BUCKET,
  MAX_ASSET_BYTES,
  type AssetRef,
  type Design,
} from "./design";
import { sniffImage } from "./image-type";

/** Signed view URLs last an hour; the editor page re-signs on every load. */
const SIGNED_URL_SECONDS = 60 * 60;

/** Browser-viewable URLs for design assets, keyed by assetKey(). */
export async function signAssetUrls(refs: AssetRef[]): Promise<Record<string, string>> {
  const admin = createAdminClient();
  const out: Record<string, string> = {};
  const privatePaths = [...new Set(refs.filter((r) => r.bucket === CERT_ASSET_BUCKET).map((r) => r.path))];
  if (privatePaths.length) {
    const { data } = await admin.storage.from(CERT_ASSET_BUCKET).createSignedUrls(privatePaths, SIGNED_URL_SECONDS);
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) out[assetKey({ bucket: CERT_ASSET_BUCKET, path: item.path })] = item.signedUrl;
    }
  }
  for (const ref of refs.filter((r) => r.bucket === LEGACY_TEMPLATE_BUCKET)) {
    out[assetKey(ref)] = admin.storage.from(LEGACY_TEMPLATE_BUCKET).getPublicUrl(ref.path).data.publicUrl;
  }
  return out;
}

/** A per-run loader that downloads each asset once. Throws a user-facing Error when one is missing. */
export function assetLoader(): (ref: AssetRef) => Promise<Uint8Array> {
  const cache = new Map<string, Promise<Uint8Array>>();
  return (ref) => {
    const key = assetKey(ref);
    let pending = cache.get(key);
    if (!pending) {
      pending = (async () => {
        const { data, error } = await createAdminClient().storage.from(ref.bucket).download(ref.path);
        if (error || !data) throw new Error("An image in the design is missing from storage. Upload it again.");
        return new Uint8Array(await data.arrayBuffer());
      })();
      cache.set(key, pending);
    }
    return pending;
  };
}

/**
 * Assets that are new in `next` (not in `previous`) must be this event's own
 * uploads and really be the PNG/JPEG they claim (magic bytes and pixel size,
 * spec §8). Returns a user-facing problem, or null when all is well.
 */
export async function verifyNewAssets(
  eventId: string,
  next: Design,
  previous: Design,
  load: (ref: AssetRef) => Promise<Uint8Array> = assetLoader(),
): Promise<string | null> {
  const known = new Set(assetRefsOf(previous).map(assetKey));
  for (const ref of assetRefsOf(next)) {
    if (known.has(assetKey(ref))) continue;
    if (ref.bucket !== CERT_ASSET_BUCKET || !ref.path.startsWith(`${eventId}/`)) {
      return "An image in the design doesn't belong to this event.";
    }
    let bytes: Uint8Array;
    try {
      bytes = await load(ref);
    } catch {
      return "An uploaded image is missing. Upload it again.";
    }
    if (bytes.byteLength > MAX_ASSET_BYTES) return "An uploaded image is over 8 MB.";
    const image = sniffImage(bytes);
    if (!image || image.type !== ref.type || image.width !== ref.widthPx || image.height !== ref.heightPx) {
      return "An uploaded file isn't the image it claims to be. Upload it again.";
    }
    known.add(assetKey(ref));
  }
  return null;
}
```

- [ ] **Step 6: Replace the data layer**

`src/lib/admin/certificates.ts` (drops v1's `getCertificateSetup`; keeps `listCertificateEvents` unchanged):

```ts
import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";
import { canManage, type AdminIdentity } from "@/lib/auth/capabilities";
import { istDateMedium } from "@/lib/datetime";
import type { FormField } from "@/lib/registration-form/schema";
import { validateCertificateConfig } from "@/lib/certificates/config";
import {
  assetRefsOf,
  canonicalJson,
  designFromLegacyConfig,
  emptyDesign,
  isKnownField,
  LEGACY_TEMPLATE_BUCKET,
  parseStoredDesign,
  validateDesign,
  type Design,
} from "@/lib/certificates/design";
import { signAssetUrls } from "@/lib/certificates/assets";
import {
  buildFieldCatalogue,
  designContextFor,
  fieldLabel,
  registrantValues,
  type CertEventInfo,
  type FieldGroup,
} from "@/lib/certificates/fields";
import { sniffImage } from "@/lib/certificates/image-type";
import {
  countRecipients,
  registrationKey,
  statusByKey,
  type Recipient,
  type RecipientCounts,
} from "@/lib/certificates/recipients";
import { designWithUnknownFieldsAsText } from "@/lib/certificates/rich-text";
import { getEventFormSchema, listRegistrations } from "./registrations";

/**
 * Data layer for the certificate designer (spec §4). Service-role reads and
 * writes of PII — every caller enforces the capability and club scope first.
 */

export const PARTICIPATION_LABEL = "Participation";
const GROUP_COLUMNS = "id, event_id, kind, name, design, sheet_columns";

export interface CertEvent {
  id: string;
  title: string;
  clubId: string | null;
  info: CertEventInfo;
  schema: FormField[];
}

export async function getCertEvent(eventId: string): Promise<CertEvent | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("events")
    .select("id, title, starts_at, ends_at, venue_text, event_clubs ( is_primary, club_id, clubs ( name ) )")
    .eq("id", eventId)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as {
    id: string;
    title: string;
    starts_at: string;
    ends_at: string | null;
    venue_text: string | null;
    event_clubs: { is_primary: boolean; club_id: string; clubs: { name: string } | null }[];
  };
  const primary = row.event_clubs.find((c) => c.is_primary) ?? row.event_clubs[0];
  const { schema } = await getEventFormSchema(eventId);
  return {
    id: row.id,
    title: row.title,
    clubId: primary?.club_id ?? null,
    schema,
    info: {
      title: row.title,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      venue: row.venue_text,
      clubName: primary?.clubs?.name ?? null,
    },
  };
}

export interface CertificateGroup {
  id: string;
  eventId: string;
  kind: "participants" | "sheet";
  name: string;
  design: Design;
  sheetColumns: string[];
}

type GroupRow = {
  id: string;
  event_id: string;
  kind: "participants" | "sheet";
  name: string;
  design: Json;
  sheet_columns: string[] | null;
};

const toGroup = (row: GroupRow): CertificateGroup => ({
  id: row.id,
  eventId: row.event_id,
  kind: row.kind,
  name: row.name,
  design: parseStoredDesign(row.design) ?? emptyDesign(),
  sheetColumns: row.sheet_columns ?? [],
});

export async function getGroup(eventId: string, groupId: string): Promise<CertificateGroup | null> {
  const { data } = await createAdminClient()
    .from("certificate_groups")
    .select(GROUP_COLUMNS)
    .eq("event_id", eventId)
    .eq("id", groupId)
    .maybeSingle();
  return data ? toGroup(data as GroupRow) : null;
}

export async function getParticipantsGroup(eventId: string): Promise<CertificateGroup | null> {
  const { data } = await createAdminClient()
    .from("certificate_groups")
    .select(GROUP_COLUMNS)
    .eq("event_id", eventId)
    .eq("kind", "participants")
    .maybeSingle();
  return data ? toGroup(data as GroupRow) : null;
}

/** The immutable version row for this exact design (created on first use). */
export async function ensureDesignVersion(groupId: string, design: Design): Promise<string> {
  const admin = createAdminClient();
  const hash = createHash("sha256").update(canonicalJson(design)).digest("hex");
  const find = () =>
    admin.from("certificate_design_versions").select("id").eq("group_id", groupId).eq("hash", hash).maybeSingle();
  const existing = await find();
  if (existing.data) return existing.data.id;
  const { data, error } = await admin
    .from("certificate_design_versions")
    .insert({ group_id: groupId, hash, design: design as unknown as Json })
    .select("id")
    .single();
  if (data) return data.id;
  if (error?.code === "23505") {
    const again = await find(); // a concurrent issue run recorded it first
    if (again.data) return again.data.id;
  }
  throw new Error("Could not record the design version.");
}

/** v1's uploaded image + name anchor as a design, or an empty design. */
async function designFromV1(eventId: string): Promise<Design> {
  const admin = createAdminClient();
  const { data: ev } = await admin
    .from("events")
    .select("certificate_template, certificate_config")
    .eq("id", eventId)
    .maybeSingle();
  if (!ev?.certificate_template) return emptyDesign();
  const dl = await admin.storage.from(LEGACY_TEMPLATE_BUCKET).download(ev.certificate_template);
  if (dl.error || !dl.data) return emptyDesign();
  const image = sniffImage(new Uint8Array(await dl.data.arrayBuffer()));
  if (!image) return emptyDesign();
  const design = designFromLegacyConfig(
    { path: ev.certificate_template, type: image.type, widthPx: image.width, heightPx: image.height },
    validateCertificateConfig(ev.certificate_config),
  );
  return validateDesign(design, { formFieldIds: new Set(), sheetColumns: new Set() }).ok ? design : emptyDesign();
}

/**
 * The event's Participants group, created on first visit — converting a v1
 * setup if there is one and attaching v1-issued certificates to it (spec §9).
 */
export async function ensureParticipantsGroup(eventId: string, actorId: string | null): Promise<CertificateGroup> {
  const existing = await getParticipantsGroup(eventId);
  if (existing) return existing;

  const admin = createAdminClient();
  const design = await designFromV1(eventId);
  const { data, error } = await admin
    .from("certificate_groups")
    .insert({ event_id: eventId, kind: "participants", name: "Participants", design: design as unknown as Json, created_by: actorId })
    .select(GROUP_COLUMNS)
    .single();
  if (error || !data) {
    const raced = await getParticipantsGroup(eventId); // another tab created it first
    if (raced) return raced;
    throw new Error("Could not set up certificates for this event.");
  }
  const group = toGroup(data as GroupRow);

  const { data: legacy } = await admin
    .from("certificates")
    .select("id")
    .eq("event_id", eventId)
    .is("group_id", null)
    .like("recipient_key", "reg:%")
    .limit(1);
  if (legacy?.length) {
    const versionId = await ensureDesignVersion(group.id, group.design);
    await admin
      .from("certificates")
      .update({ group_id: group.id, design_version_id: versionId })
      .eq("event_id", eventId)
      .is("group_id", null)
      .like("recipient_key", "reg:%");
  }
  return group;
}

/** Attendees as certificate recipients, each with values and issue status (phase 1: registrants). */
export async function listParticipantRecipients(event: CertEvent): Promise<Recipient[]> {
  const admin = createAdminClient();
  const [registrations, ledger] = await Promise.all([
    listRegistrations(event.id),
    admin
      .from("certificates")
      .select("id, recipient_key, serial, issued_at, revoked_at, revoked_reason")
      .eq("event_id", event.id)
      .eq("type", "participation"),
  ]);
  if (ledger.error) throw ledger.error;
  const status = statusByKey(ledger.data ?? []);
  return registrations
    .filter((r) => r.attended)
    .map((r) => {
      const key = registrationKey(r.id);
      return {
        key,
        registrationId: r.id,
        name: r.name.trim(),
        email: r.email.trim() || null,
        values: registrantValues({ event: event.info, schema: event.schema, registration: r, groupLabel: PARTICIPATION_LABEL }),
        status: status.get(key) ?? { state: "pending" },
      };
    });
}

export interface CertificateWorkspace {
  event: CertEvent;
  group: CertificateGroup;
  /** The stored design, with any field that no longer exists shown as text — what the editor opens. */
  editableDesign: Design;
  catalogue: FieldGroup[];
  recipients: Recipient[];
  counts: RecipientCounts;
  assetUrls: Record<string, string>;
}

export async function getCertificateWorkspace(eventId: string, actorId: string | null): Promise<CertificateWorkspace | null> {
  const event = await getCertEvent(eventId);
  if (!event) return null;
  const group = await ensureParticipantsGroup(eventId, actorId);
  const catalogue = buildFieldCatalogue({ formSchema: event.schema, sheetColumns: group.sheetColumns });
  const ctx = designContextFor(event.schema, group.sheetColumns);
  const editableDesign = designWithUnknownFieldsAsText(
    group.design,
    (key) => isKnownField(key, ctx),
    (key) => fieldLabel(catalogue, key),
  );
  const [recipients, assetUrls] = await Promise.all([
    listParticipantRecipients(event),
    signAssetUrls(assetRefsOf(editableDesign)),
  ]);
  return { event, group, editableDesign, catalogue, recipients, counts: countRecipients(recipients), assetUrls };
}

/** Other events whose design this admin may copy: they manage the event and it has a template. */
export async function listDesignSources(
  identity: AdminIdentity,
  eventId: string,
): Promise<{ eventId: string; title: string; date: string }[]> {
  const { data } = await createAdminClient()
    .from("certificate_groups")
    .select("event_id, design, events ( title, starts_at, event_clubs ( is_primary, club_id ) )")
    .eq("kind", "participants")
    .neq("event_id", eventId);
  const rows = (data ?? []) as unknown as {
    event_id: string;
    design: Json;
    events: { title: string; starts_at: string; event_clubs: { is_primary: boolean; club_id: string }[] } | null;
  }[];
  return rows
    .filter((row) => {
      if (!row.events || !parseStoredDesign(row.design)?.page.template) return false;
      const primary = row.events.event_clubs.find((c) => c.is_primary) ?? row.events.event_clubs[0];
      return canManage(identity, "issue:participation_certificate", primary?.club_id ?? null);
    })
    .sort((a, b) => b.events!.starts_at.localeCompare(a.events!.starts_at))
    .map((row) => ({ eventId: row.event_id, title: row.events!.title, date: istDateMedium(row.events!.starts_at) }));
}

export interface CertificateEventRow {
  id: string;
  title: string;
  startsAt: string;
  attended: number;
  issued: number;
}

/** Events that have at least one attendee, for the certificates hub. Newest first. */
export async function listCertificateEvents(): Promise<CertificateEventRow[]> {
  const admin = createAdminClient();

  const [attRes, certRes] = await Promise.all([
    admin.from("registrations").select("event_id").eq("attended", true),
    admin.from("certificates").select("event_id, revoked_at").eq("type", "participation"),
  ]);

  const attended = new Map<string, number>();
  for (const r of attRes.data ?? []) {
    if (r.event_id) attended.set(r.event_id, (attended.get(r.event_id) ?? 0) + 1);
  }
  if (attended.size === 0) return [];

  const issued = new Map<string, number>();
  for (const c of certRes.data ?? []) {
    if (c.event_id && !c.revoked_at) issued.set(c.event_id, (issued.get(c.event_id) ?? 0) + 1);
  }

  const { data: events } = await admin.from("events").select("id, title, starts_at").in("id", [...attended.keys()]);

  return (events ?? [])
    .map((e) => ({
      id: e.id,
      title: e.title,
      startsAt: e.starts_at,
      attended: attended.get(e.id) ?? 0,
      issued: issued.get(e.id) ?? 0,
    }))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
}
```

- [ ] **Step 7: Type-check the new server modules**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "src/lib/(admin/certificates|certificates/)" || echo "no errors in new modules"`
Expected: `no errors in new modules`. Errors in the v1 `actions.ts`, `page.tsx` and `CertificateManager.tsx` are expected until Task 12.

- [ ] **Step 8: Commit**

```bash
git add src/lib/certificates/recipients.ts src/lib/certificates/recipients.test.ts src/lib/certificates/assets.ts src/lib/admin/certificates.ts
git commit -m "feat(certificates): recipient status, private asset storage and designer data layer

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Issuing, server actions, preview route and font tracing

**Files:**
- Create: `src/lib/admin/certificate-issue.ts`
- Replace: `src/app/admin/(app)/events/[id]/certificates/actions.ts`
- Create: `src/app/api/admin/events/[id]/certificates/preview/route.ts`
- Modify: `next.config.ts`

**Interfaces:**
- Consumes: Tasks 6 and 8; `renderEmail`, `sendEmail`; `newCertificateSerial`, `certificateHmac`; `writeAudit`; `getAdminSession`, `requireSession`, `requireSameOrigin`; `getEventForAttendance`.
- Produces:
  - `certificate-issue.ts`: `ISSUE_BATCH = 40`, `IssueBatchResult { processed; sent; recorded; failed; skipped; remaining }`, `issueParticipantBatch({ eventId, mode, actorId })`
  - `actions.ts`:
    - Types: `ActionResult`, `UploadTicket`, `IssueBatchResponse`, `CopyDesignResult`
    - `saveCertificateDesignAction({ eventId, groupId, design })`
    - `createCertificateUploadAction({ eventId, contentType, size })`
    - `issueCertificatesBatchAction({ eventId, mode })`
    - `copyCertificateDesignAction({ eventId, sourceEventId })`
  - Route: `POST /api/admin/events/[id]/certificates/preview` with body `{ groupId, design, recipientKey | null }` → `application/pdf`

- [ ] **Step 1: Add the issue core**

`src/lib/admin/certificate-issue.ts`:

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";
import { writeAudit } from "./audit";
import { assetLoader } from "@/lib/certificates/assets";
import { isKnownField } from "@/lib/certificates/design";
import { designContextFor, formatIstDate, type FieldValues } from "@/lib/certificates/fields";
import { loadFontFile } from "@/lib/certificates/font-files";
import { certificateFileName, pendingRecipients, type IssueMode, type Recipient } from "@/lib/certificates/recipients";
import { renderCertificatesPdf } from "@/lib/certificates/render";
import { certificateHmac, newCertificateSerial } from "@/lib/certificates/serial";
import { renderEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/transport";
import { ensureDesignVersion, getCertificateWorkspace, PARTICIPATION_LABEL } from "./certificates";

/** Recipients per server call — Gmail sends ~1/s, so this stays well inside the function timeout. */
export const ISSUE_BATCH = 40;

export interface IssueBatchResult {
  /** Recipients this call attempted. 0 = nothing left to do. */
  processed: number;
  sent: number;
  recorded: number;
  failed: number;
  /** Already issued by a concurrent run. */
  skipped: number;
  /** Pending recipients left after this call. */
  remaining: number;
}

type Reserved = { id: string; values: FieldValues };

/** Insert the ledger row first (at-most-once): a failed send deletes it again. */
async function reserveCertificate(input: {
  eventId: string;
  groupId: string;
  versionId: string;
  recipient: Recipient;
  actorId: string;
}): Promise<Reserved | "exists" | null> {
  const admin = createAdminClient();
  for (let attempt = 0; attempt < 3; attempt++) {
    const serial = newCertificateSerial();
    const values: FieldValues = {
      ...input.recipient.values,
      "cert.serial": serial,
      "cert.issueDate": formatIstDate(new Date()),
      "cert.group": PARTICIPATION_LABEL,
    };
    const { data, error } = await admin
      .from("certificates")
      .insert({
        event_id: input.eventId,
        registration_id: input.recipient.registrationId,
        type: "participation",
        serial,
        hmac: certificateHmac(serial),
        issued_by: input.actorId,
        group_id: input.groupId,
        design_version_id: input.versionId,
        recipient_key: input.recipient.key,
        recipient_name: input.recipient.name,
        recipient_email: input.recipient.email,
        snapshot: { values, groupLabel: PARTICIPATION_LABEL } as unknown as Json,
      })
      .select("id")
      .single();
    if (data) return { id: data.id, values };
    if (error?.code !== "23505") return null;
    if (error.message.includes("certificates_one_live_per_recipient")) return "exists";
    // otherwise a serial clash — try a fresh serial
  }
  return null;
}

/** Issue the next batch of Participants certificates (spec §5.2). */
export async function issueParticipantBatch(args: {
  eventId: string;
  mode: IssueMode;
  actorId: string;
}): Promise<IssueBatchResult | { error: string }> {
  const ws = await getCertificateWorkspace(args.eventId, args.actorId);
  if (!ws) return { error: "That event no longer exists." };
  const { design } = ws.group;
  if (!design.page.template) return { error: "Add a template in the Design tab first." };
  const ctx = designContextFor(ws.event.schema, ws.group.sheetColumns);
  for (const el of design.elements) {
    if (el.type !== "text") continue;
    const stale = el.paragraphs.flatMap((p) => p.runs).find((r) => r.kind === "field" && !isKnownField(r.field, ctx));
    if (stale) return { error: `"${el.name}" uses a field that no longer exists. Open Design, fix it and save.` };
  }

  const pending = pendingRecipients(ws.recipients, args.mode);
  const batch = pending.slice(0, ISSUE_BATCH);
  const result: IssueBatchResult = { processed: batch.length, sent: 0, recorded: 0, failed: 0, skipped: 0, remaining: pending.length };
  if (batch.length === 0) return result;

  const admin = createAdminClient();
  const versionId = await ensureDesignVersion(ws.group.id, design);
  const loadAsset = assetLoader();

  for (const recipient of batch) {
    const reserved = await reserveCertificate({ eventId: args.eventId, groupId: ws.group.id, versionId, recipient, actorId: args.actorId });
    if (reserved === "exists") {
      result.skipped++;
      continue;
    }
    if (!reserved) {
      result.failed++;
      continue;
    }
    if (args.mode === "record") {
      result.recorded++;
      continue;
    }
    try {
      const pdf = await renderCertificatesPdf({
        design,
        pages: [{ valueFor: (key) => reserved.values[key] ?? "" }],
        loadAsset,
        loadFont: loadFontFile,
        title: `Certificate — ${ws.event.title}`,
      });
      const subject = `Your certificate — ${ws.event.title}`;
      const { html, text } = renderEmail("participation_certificate", subject, recipient.name, null);
      const sent = await sendEmail({
        to: recipient.email!,
        subject,
        html,
        text,
        attachments: [
          {
            filename: certificateFileName(recipient.name, ws.event.title),
            content: Buffer.from(pdf),
            contentType: "application/pdf",
          },
        ],
      });
      if (!sent.ok) throw new Error(sent.error);
      result.sent++;
    } catch (err) {
      console.error("certificate issue failed:", err instanceof Error ? err.message : err);
      await admin.from("certificates").delete().eq("id", reserved.id);
      result.failed++;
    }
  }

  result.remaining = Math.max(0, pending.length - result.sent - result.recorded - result.skipped);
  await writeAudit({
    actorId: args.actorId,
    action: "issue",
    entity: "certificate",
    entityId: args.eventId,
    after: {
      type: "participation",
      mode: args.mode,
      group: ws.group.id,
      designVersion: versionId,
      sent: result.sent,
      recorded: result.recorded,
      failed: result.failed,
      skipped: result.skipped,
    },
  });
  return result;
}
```

- [ ] **Step 2: Replace the actions**

`src/app/admin/(app)/events/[id]/certificates/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";
import { getAdminSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { writeAudit } from "@/lib/admin/audit";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { getCertEvent, getGroup, getParticipantsGroup } from "@/lib/admin/certificates";
import { issueParticipantBatch, type IssueBatchResult } from "@/lib/admin/certificate-issue";
import { assetLoader, signAssetUrls, verifyNewAssets } from "@/lib/certificates/assets";
import {
  assetKey,
  assetRefsOf,
  CERT_ASSET_BUCKET,
  isKnownField,
  MAX_ASSET_BYTES,
  validateDesign,
  type AssetRef,
  type Design,
} from "@/lib/certificates/design";
import { buildFieldCatalogue, designContextFor, fieldLabel } from "@/lib/certificates/fields";
import type { IssueMode } from "@/lib/certificates/recipients";
import { designWithUnknownFieldsAsText } from "@/lib/certificates/rich-text";

const CAP = "issue:participation_certificate";
const uuid = z.string().uuid();

export type ActionResult = { ok: true } | { ok: false; error: string };
export type UploadTicket = { ok: true; path: string; token: string } | { ok: false; error: string };
export type IssueBatchResponse = ({ ok: true } & IssueBatchResult) | { ok: false; error: string };
export type CopyDesignResult =
  | { ok: true; design: Design; assetUrls: Record<string, string> }
  | { ok: false; error: string };

/** Session + own-club scope for a certificate action on an event. */
async function authorize(eventId: string) {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." } as const;
  if (!uuid.safeParse(eventId).success) return { error: "Missing event." } as const;
  const ev = await getEventForAttendance(eventId);
  if (!ev) return { error: "That event no longer exists." } as const;
  if (!canManage(session, CAP, ev.clubId)) return { error: "You can't manage certificates for that event." } as const;
  return { session, ev };
}

/** Validate and store a group's working design (spec §2.4, §6.4). */
export async function saveCertificateDesignAction(input: {
  eventId: string;
  groupId: string;
  design: unknown;
}): Promise<ActionResult> {
  const auth = await authorize(input.eventId);
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!uuid.safeParse(input.groupId).success) return { ok: false, error: "Missing certificate group." };

  const [event, group] = await Promise.all([getCertEvent(input.eventId), getGroup(input.eventId, input.groupId)]);
  if (!event || !group) return { ok: false, error: "That certificate group no longer exists." };

  const checked = validateDesign(input.design, designContextFor(event.schema, group.sheetColumns));
  if (!checked.ok) return { ok: false, error: checked.error };
  const assetProblem = await verifyNewAssets(input.eventId, checked.design, group.design);
  if (assetProblem) return { ok: false, error: assetProblem };

  const { error } = await createAdminClient()
    .from("certificate_groups")
    .update({ design: checked.design as unknown as Json, updated_at: new Date().toISOString() })
    .eq("id", group.id)
    .eq("event_id", input.eventId);
  if (error) return { ok: false, error: "Could not save the design. Try again." };

  await writeAudit({
    actorId: auth.session.id,
    action: "update",
    entity: "certificate_design",
    entityId: group.id,
    after: {
      eventId: input.eventId,
      elements: checked.design.elements.length,
      templateChanged: group.design.page.template?.path !== checked.design.page.template?.path,
    },
  });
  revalidatePath(`/admin/events/${input.eventId}/certificates`);
  return { ok: true };
}

/** A one-path signed upload URL for a design asset — the browser uploads straight to Storage. */
export async function createCertificateUploadAction(input: {
  eventId: string;
  contentType: string;
  size: number;
}): Promise<UploadTicket> {
  const auth = await authorize(input.eventId);
  if ("error" in auth) return { ok: false, error: auth.error };
  if (input.contentType !== "image/png" && input.contentType !== "image/jpeg") {
    return { ok: false, error: "Images must be PNG or JPEG." };
  }
  if (!(input.size > 0 && input.size <= MAX_ASSET_BYTES)) return { ok: false, error: "Images must be 8 MB or smaller." };

  const path = `${input.eventId}/${crypto.randomUUID()}.${input.contentType === "image/png" ? "png" : "jpg"}`;
  const { data, error } = await createAdminClient().storage.from(CERT_ASSET_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "Could not start the upload. Try again." };
  return { ok: true, path: data.path, token: data.token };
}

/** Issue the next batch; the Issue tab calls this in a loop (spec §5.2). */
export async function issueCertificatesBatchAction(input: { eventId: string; mode: IssueMode }): Promise<IssueBatchResponse> {
  const auth = await authorize(input.eventId);
  if ("error" in auth) return { ok: false, error: auth.error };
  if (input.mode !== "email" && input.mode !== "record") return { ok: false, error: "Unknown issue mode." };

  const result = await issueParticipantBatch({ eventId: input.eventId, mode: input.mode, actorId: auth.session.id });
  if ("error" in result) return { ok: false, error: result.error };
  revalidatePath(`/admin/events/${input.eventId}/certificates`);
  return { ok: true, ...result };
}

/**
 * "Start from another event's design": copy its design and images into this
 * event. Not saved — the editor shows it as unsaved changes.
 */
export async function copyCertificateDesignAction(input: {
  eventId: string;
  sourceEventId: string;
}): Promise<CopyDesignResult> {
  const auth = await authorize(input.eventId);
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!uuid.safeParse(input.sourceEventId).success) return { ok: false, error: "Choose an event to copy from." };
  const source = await getEventForAttendance(input.sourceEventId);
  if (!source || !canManage(auth.session, CAP, source.clubId)) return { ok: false, error: "You can't copy from that event." };

  const [target, sourceEvent, sourceGroup] = await Promise.all([
    getCertEvent(input.eventId),
    getCertEvent(input.sourceEventId),
    getParticipantsGroup(input.sourceEventId),
  ]);
  if (!target || !sourceEvent || !sourceGroup?.design.page.template) {
    return { ok: false, error: "That event has no design to copy." };
  }

  const admin = createAdminClient();
  const load = assetLoader();
  const moved = new Map<string, AssetRef>();
  try {
    for (const ref of assetRefsOf(sourceGroup.design)) {
      if (moved.has(assetKey(ref))) continue;
      const path = `${input.eventId}/${crypto.randomUUID()}.${ref.type}`;
      const { error } = await admin.storage
        .from(CERT_ASSET_BUCKET)
        .upload(path, await load(ref), { contentType: ref.type === "png" ? "image/png" : "image/jpeg", upsert: false });
      if (error) throw new Error(error.message);
      moved.set(assetKey(ref), { ...ref, bucket: CERT_ASSET_BUCKET, path });
    }
  } catch {
    return { ok: false, error: "Could not copy that design's images. Try again." };
  }

  const swap = (ref: AssetRef) => moved.get(assetKey(ref)) ?? ref;
  const copied: Design = {
    ...sourceGroup.design,
    page: { ...sourceGroup.design.page, template: swap(sourceGroup.design.page.template) },
    elements: sourceGroup.design.elements.map((el) => (el.type === "image" ? { ...el, asset: swap(el.asset) } : el)),
  };
  // Form questions differ between events: fields this event lacks become visible text.
  const ctx = designContextFor(target.schema);
  const sourceCatalogue = buildFieldCatalogue({ formSchema: sourceEvent.schema });
  const design = designWithUnknownFieldsAsText(copied, (k) => isKnownField(k, ctx), (k) => fieldLabel(sourceCatalogue, k));

  await writeAudit({
    actorId: auth.session.id,
    action: "copy",
    entity: "certificate_design",
    entityId: input.eventId,
    after: { fromEvent: input.sourceEventId, assets: moved.size },
  });
  return { ok: true, design, assetUrls: await signAssetUrls([...moved.values()]) };
}
```

- [ ] **Step 3: Add the preview route**

`src/app/api/admin/events/[id]/certificates/preview/route.ts`:

```ts
import { z } from "zod";
import { requireSameOrigin, requireSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { getGroup, getCertificateWorkspace } from "@/lib/admin/certificates";
import { assetLoader, verifyNewAssets } from "@/lib/certificates/assets";
import { validateDesign } from "@/lib/certificates/design";
import { designContextFor, fieldNameValue, formatIstDate } from "@/lib/certificates/fields";
import { loadFontFile } from "@/lib/certificates/font-files";
import { renderCertificatesPdf } from "@/lib/certificates/render";

const Body = z.object({
  groupId: z.string().uuid(),
  design: z.unknown(),
  recipientKey: z.string().max(200).nullable(),
});

/**
 * Preview PDF of the design as currently edited (unsaved changes included),
 * filled for one recipient or with field names, watermarked PREVIEW. Gated like
 * the certificate actions; POST because the design travels in the body.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const badOrigin = requireSameOrigin(request);
  if (badOrigin) return badOrigin;
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const ev = z.string().uuid().safeParse(id).success ? await getEventForAttendance(id) : null;
  if (!ev || !canManage(guard.session, "issue:participation_certificate", ev.clubId)) {
    return Response.json({ error: "Not permitted." }, { status: 403 });
  }

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Bad preview request." }, { status: 400 });

  const [ws, group] = await Promise.all([getCertificateWorkspace(id, guard.session.id), getGroup(id, body.data.groupId)]);
  if (!ws || !group) return Response.json({ error: "That certificate group no longer exists." }, { status: 404 });

  const checked = validateDesign(body.data.design, designContextFor(ws.event.schema, group.sheetColumns));
  if (!checked.ok) return Response.json({ error: checked.error }, { status: 400 });
  const loadAsset = assetLoader();
  const assetProblem = await verifyNewAssets(id, checked.design, group.design, loadAsset);
  if (assetProblem) return Response.json({ error: assetProblem }, { status: 400 });

  const recipient = body.data.recipientKey ? ws.recipients.find((r) => r.key === body.data.recipientKey) : undefined;
  const names = fieldNameValue(ws.catalogue);
  const extras: Record<string, string> = { "cert.serial": "CSE-PREVIEW", "cert.issueDate": formatIstDate(new Date()) };
  const valueFor = recipient
    ? (key: string) => extras[key] ?? recipient.values[key] ?? ""
    : (key: string) => (key in extras ? extras[key] : names(key));

  let pdf: Uint8Array;
  try {
    pdf = await renderCertificatesPdf({
      design: checked.design,
      pages: [{ valueFor }],
      loadAsset,
      loadFont: loadFontFile,
      watermark: "PREVIEW",
      title: `Preview — ${ws.event.title}`,
    });
  } catch (err) {
    console.error("certificate preview failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Could not build the preview." }, { status: 500 });
  }

  // Streamed so a large template never hits a buffered-response size cap.
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(pdf);
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'inline; filename="certificate-preview.pdf"',
      "cache-control": "no-store",
    },
  });
}
```

- [ ] **Step 4: Trace the font files into the certificate functions**

Read `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md` (the `outputFileTracingIncludes` section: keys are picomatch route globs, values are globs from the project root). In `next.config.ts`, change:

```ts
  turbopack: { root: import.meta.dirname },
```

to:

```ts
  turbopack: { root: import.meta.dirname },
  // The certificate renderer reads the bundled TTFs from disk (font-files.ts);
  // they are in public/, which is not part of a function's trace by default.
  outputFileTracingIncludes: {
    "/admin/**/certificates": ["./public/fonts/cert/*.ttf"],
    "/api/admin/events/**": ["./public/fonts/cert/*.ttf"],
  },
```

- [ ] **Step 5: Lint and type-check the new files**

```bash
npx eslint "src/lib/admin/certificate-issue.ts" "src/app/admin/(app)/events/[id]/certificates/actions.ts" "src/app/api/admin/events/[id]/certificates/preview/route.ts" next.config.ts
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "certificate-issue|certificates/actions|certificates/preview|next.config" || echo "no errors in new modules"
```

Expected: ESLint clean (the admin-route-guard rule passes because `POST` calls `requireSession`), and `no errors in new modules`. If TypeScript does not narrow `sourceGroup.design.page.template` inside `copyCertificateDesignAction`, bind it first: `const template = sourceGroup.design.page.template;`. The remaining expected errors are in `page.tsx` and `CertificateManager.tsx` (fixed in Task 12).

- [ ] **Step 6: Commit**

```bash
git add src/lib/admin/certificate-issue.ts "src/app/admin/(app)/events/[id]/certificates/actions.ts" "src/app/api/admin/events/[id]/certificates/preview/route.ts" next.config.ts
git commit -m "feat(certificates): batch issuing, design save/upload/copy actions and preview PDF route

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Editor logic — geometry, state and image preparation

**Files:**
- Create: `src/components/admin/certificates/geometry.ts`, `src/components/admin/certificates/designer-state.ts`, `src/components/admin/certificates/image-prep.ts`
- Test: `geometry.test.ts`, `designer-state.test.ts`, `image-prep.test.ts` (same folder)

**Interfaces:**
- Consumes: `AssetRef`, `Design`, `DesignElement`, `DEFAULT_STYLE`, `emptyDesign`, `TextElement` (Task 2).
- Produces:
  - `geometry.ts`:
    - Types: `Rect`, `Handle`, `Guide`
    - Constants: `MIN_BOX_PX`
    - Functions: `resizeRect(start, handle, dx, dy, keepAspect)`, `snapTargets(page, others)`, `snapMove(rect, targets, threshold)`, `pctToPx`, `pxToPct`, `clampPct`, `pctToPt`, `ptToPct`
  - `designer-state.ts`: types `EditorState`, `EditorAction`, `ElementPatch`; `UNDO_LIMIT`; `initEditorState(design)`, `editorReducer(state, action)`
  - `image-prep.ts`:
    - Types: `AssetKind`, `PrepPlan`, `PreparedImage`
    - Constants: `MAX_UPLOAD_BYTES`
    - Functions: `isAcceptedImage`, `fitSize`, `planImagePrep`, `prepareImage(file, kind)` (browser only)

- [ ] **Step 1: Write the failing tests**

`src/components/admin/certificates/geometry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { clampPct, pctToPt, pctToPx, ptToPct, pxToPct, resizeRect, snapMove, snapTargets, MIN_BOX_PX } from "./geometry";

const start = { x: 100, y: 100, w: 200, h: 100 };

describe("resizeRect", () => {
  it("pins the opposite edge for free resizes", () => {
    expect(resizeRect(start, "e", 50, 0, false)).toEqual({ x: 100, y: 100, w: 250, h: 100 });
    expect(resizeRect(start, "nw", 20, 10, false)).toEqual({ x: 120, y: 110, w: 180, h: 90 });
  });

  it("keeps the aspect ratio from a corner", () => {
    expect(resizeRect(start, "se", 100, 0, true)).toEqual({ x: 100, y: 100, w: 300, h: 150 });
    expect(resizeRect(start, "nw", -100, 0, true)).toEqual({ x: 0, y: 50, w: 300, h: 150 });
  });

  it("grows the other axis around the centre from an edge when aspect-locked", () => {
    expect(resizeRect(start, "e", 100, 0, true)).toEqual({ x: 100, y: 75, w: 300, h: 150 });
  });

  it("never collapses below the minimum size", () => {
    const r = resizeRect(start, "w", 500, 0, false);
    expect(r.w).toBe(MIN_BOX_PX);
    expect(r.x).toBe(100 + 200 - MIN_BOX_PX);
  });
});

describe("snapMove", () => {
  const targets = snapTargets({ widthPx: 1000, heightPx: 800 }, [{ x: 600, y: 600, w: 100, h: 50 }]);

  it("snaps the box centre to the page centre and reports a guide", () => {
    const { rect, guides } = snapMove({ x: 403, y: 10, w: 200, h: 100 }, targets, 5);
    expect(rect.x).toBe(400);
    expect(guides).toEqual([{ axis: "x", at: 500 }]);
  });

  it("snaps edges to another box and ignores far targets", () => {
    const { rect, guides } = snapMove({ x: 100, y: 647, w: 50, h: 50 }, targets, 5);
    expect(rect.y).toBe(650);
    expect(guides).toEqual([{ axis: "y", at: 650 }]);
    expect(snapMove({ x: 120, y: 200, w: 50, h: 50 }, targets, 5).guides).toEqual([]);
  });
});

describe("% ↔ px", () => {
  it("round-trips", () => {
    const page = { widthPx: 3508, heightPx: 2480 };
    const pct = { x: 12.5, y: 40, w: 50, h: 7.25 };
    expect(pxToPct(pctToPx(pct, page), page)).toEqual(pct);
  });

  it("clamps into the range validation accepts", () => {
    expect(clampPct({ x: -80, y: 200, w: 0.1, h: 500 })).toEqual({ x: -50, y: 150, w: 0.5, h: 200 });
  });
});

describe("pt ↔ %", () => {
  it("converts against an A4-sized PDF page", () => {
    const landscape = { widthPx: 3508, heightPx: 2480 };
    expect(pctToPt(4, landscape)).toBe(23.8);
    expect(ptToPct(23.8, landscape)).toBe(4);
    const portrait = { widthPx: 2480, heightPx: 3508 };
    expect(pctToPt(4, portrait)).toBe(33.7);
  });
});
```

`src/components/admin/certificates/designer-state.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { DEFAULT_STYLE, emptyDesign, type DesignElement, type TextElement } from "@/lib/certificates/design";
import { editorReducer, initEditorState, UNDO_LIMIT, type EditorState } from "./designer-state";

const text = (id: string, over: Partial<TextElement> = {}): TextElement => ({
  id,
  name: id.toUpperCase(),
  type: "text",
  x: 10,
  y: 10,
  w: 30,
  h: 10,
  locked: false,
  hidden: false,
  align: "left",
  lineHeight: 1.2,
  fit: "wrap",
  paragraphs: [{ runs: [{ kind: "text", text: id, style: DEFAULT_STYLE }] }],
  ...over,
});

function stateWith(...elements: DesignElement[]): EditorState {
  return initEditorState({ ...emptyDesign(), elements });
}

const ids = (s: EditorState) => s.design.elements.map((e) => e.id);

describe("editorReducer", () => {
  it("updates elements, marks dirty and records one undo step", () => {
    let s = stateWith(text("a"));
    s = editorReducer(s, { type: "update", changes: [{ id: "a", patch: { x: 50 } }] });
    expect(s.design.elements[0].x).toBe(50);
    expect(s.dirty).toBe(true);
    expect(s.past).toHaveLength(1);
  });

  it("coalesces updates that share a key (a drag) into one undo step", () => {
    let s = stateWith(text("a"));
    for (const x of [11, 12, 13]) s = editorReducer(s, { type: "update", changes: [{ id: "a", patch: { x } }], key: "drag-1" });
    expect(s.past).toHaveLength(1);
    s = editorReducer(s, { type: "undo" });
    expect(s.design.elements[0].x).toBe(10);
    s = editorReducer(s, { type: "redo" });
    expect(s.design.elements[0].x).toBe(13);
  });

  it("starts a new step after any other action", () => {
    let s = stateWith(text("a"));
    s = editorReducer(s, { type: "update", changes: [{ id: "a", patch: { x: 11 } }], key: "k" });
    s = editorReducer(s, { type: "select", ids: ["a"] });
    s = editorReducer(s, { type: "update", changes: [{ id: "a", patch: { x: 12 } }], key: "k" });
    expect(s.past).toHaveLength(2);
  });

  it("caps the undo history", () => {
    let s = stateWith(text("a"));
    for (let i = 0; i < UNDO_LIMIT + 20; i++) s = editorReducer(s, { type: "update", changes: [{ id: "a", patch: { x: i } }] });
    expect(s.past).toHaveLength(UNDO_LIMIT);
  });

  it("adds and selects a new element; deletes the selection but never locked elements", () => {
    let s = stateWith(text("a", { locked: true }), text("b"));
    s = editorReducer(s, { type: "add", element: text("c") });
    expect(ids(s)).toEqual(["a", "b", "c"]);
    expect(s.selection).toEqual(["c"]);
    s = editorReducer(s, { type: "select", ids: ["a", "c"] });
    s = editorReducer(s, { type: "deleteSelected" });
    expect(ids(s)).toEqual(["a", "b"]);
  });

  it("duplicates with an offset and selects the copies", () => {
    let s = stateWith(text("a"));
    s = editorReducer(s, { type: "select", ids: ["a"] });
    s = editorReducer(s, { type: "duplicateSelected", newId: () => "a2" });
    expect(ids(s)).toEqual(["a", "a2"]);
    expect(s.design.elements[1]).toMatchObject({ x: 12, y: 12, name: "A copy" });
    expect(s.selection).toEqual(["a2"]);
  });

  it("reorders layers", () => {
    let s = stateWith(text("a"), text("b"), text("c"));
    s = editorReducer(s, { type: "reorder", id: "a", to: "front" });
    expect(ids(s)).toEqual(["b", "c", "a"]);
    s = editorReducer(s, { type: "reorder", id: "a", to: "down" });
    expect(ids(s)).toEqual(["b", "a", "c"]);
    s = editorReducer(s, { type: "reorder", id: "c", to: "back" });
    expect(ids(s)).toEqual(["c", "b", "a"]);
  });

  it("sets the template and adopts its page size", () => {
    let s = stateWith();
    const template = { bucket: "certificate-assets" as const, path: "p", type: "jpg" as const, widthPx: 2000, heightPx: 1414 };
    s = editorReducer(s, { type: "setTemplate", template });
    expect(s.design.page).toEqual({ template, widthPx: 2000, heightPx: 1414 });
  });

  it("only opens unlocked text elements for editing", () => {
    let s = stateWith(text("a"), text("b", { locked: true }));
    expect(editorReducer(s, { type: "startEdit", id: "b" }).editingId).toBeNull();
    s = editorReducer(s, { type: "startEdit", id: "a" });
    expect(s).toMatchObject({ editingId: "a", selection: ["a"] });
    expect(editorReducer(s, { type: "select", ids: [] }).editingId).toBeNull();
  });

  it("clears dirty on save without touching history", () => {
    let s = stateWith(text("a"));
    s = editorReducer(s, { type: "update", changes: [{ id: "a", patch: { y: 1 } }] });
    s = editorReducer(s, { type: "markSaved" });
    expect(s.dirty).toBe(false);
    expect(s.past).toHaveLength(1);
  });
});
```

`src/components/admin/certificates/image-prep.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fitSize, isAcceptedImage, planImagePrep } from "./image-prep";

const MB = 1024 * 1024;

describe("fitSize", () => {
  it("scales templates into A4 at 300 dpi in either orientation, never up", () => {
    expect(fitSize(7016, 4960, "template")).toEqual({ width: 3508, height: 2480 });
    expect(fitSize(2480, 7016, "template")).toEqual({ width: 1240, height: 3508 });
    expect(fitSize(2000, 1414, "template")).toEqual({ width: 2000, height: 1414 });
  });

  it("caps logos and signatures at a 2000 px long edge", () => {
    expect(fitSize(4000, 1000, "image")).toEqual({ width: 2000, height: 500 });
    expect(fitSize(300, 300, "image")).toEqual({ width: 300, height: 300 });
  });
});

describe("planImagePrep", () => {
  it("uploads a right-sized PNG untouched", () => {
    expect(planImagePrep({ type: "image/png", size: MB }, { width: 400, height: 400 }, "image").redraw).toBe(false);
  });

  it("always redraws JPEGs so EXIF rotation is baked in", () => {
    expect(planImagePrep({ type: "image/jpeg", size: MB }, { width: 3000, height: 2000 }, "template")).toEqual({
      redraw: true,
      width: 3000,
      height: 2000,
      output: "jpeg",
    });
  });

  it("rasterises SVG and WebP to PNG", () => {
    expect(planImagePrep({ type: "image/svg+xml", size: 2000 }, { width: 500, height: 200 }, "image")).toEqual({
      redraw: true,
      width: 500,
      height: 200,
      output: "png",
    });
  });

  it("re-encodes a heavy PNG template as JPEG when opaque", () => {
    expect(planImagePrep({ type: "image/png", size: 5 * MB }, { width: 3508, height: 2480 }, "template")).toMatchObject({
      redraw: true,
      output: "auto",
    });
  });

  it("keeps PNG output for logos so transparency survives", () => {
    expect(planImagePrep({ type: "image/png", size: 5 * MB }, { width: 4000, height: 4000 }, "image").output).toBe("png");
  });

  it("accepts only the four supported types", () => {
    expect(isAcceptedImage("image/webp")).toBe(true);
    expect(isAcceptedImage("image/gif")).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `npx vitest run src/components/admin/certificates`
Expected: FAIL — unresolved imports `./geometry`, `./designer-state`, `./image-prep`.

- [ ] **Step 3: Implement**

`src/components/admin/certificates/geometry.ts`:

```ts
/**
 * Pure canvas geometry for the certificate editor: moving, resizing and
 * snapping boxes. Works in PAGE PIXELS; the canvas converts pointer deltas by
 * dividing by the zoom, and converts results back to % when dispatching.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export interface Guide {
  axis: "x" | "y";
  /** Position of the guide line in page px. */
  at: number;
}

export const MIN_BOX_PX = 8;

/**
 * Resize from a handle by a pointer delta. `keepAspect` preserves the starting
 * ratio (images by default); the opposite edge or corner stays pinned.
 */
export function resizeRect(start: Rect, handle: Handle, dx: number, dy: number, keepAspect: boolean): Rect {
  let { x, y, w, h } = start;
  const east = handle.includes("e");
  const west = handle.includes("w");
  const north = handle.includes("n");
  const south = handle.includes("s");

  if (east) w = start.w + dx;
  if (west) w = start.w - dx;
  if (south) h = start.h + dy;
  if (north) h = start.h - dy;
  w = Math.max(MIN_BOX_PX, w);
  h = Math.max(MIN_BOX_PX, h);

  if (keepAspect && start.h > 0) {
    const ratio = start.w / start.h;
    const horizontalOnly = (east || west) && !(north || south);
    const verticalOnly = (north || south) && !(east || west);
    if (horizontalOnly) h = w / ratio;
    else if (verticalOnly) w = h * ratio;
    else if (w / h > ratio) h = w / ratio; // corner: follow the larger change
    else w = h * ratio;
  }

  if (west) x = start.x + start.w - w;
  if (north) y = start.y + start.h - h;
  // Edge handles on an aspect-locked box grow the other axis around its centre.
  if (keepAspect && (east || west) && !(north || south)) y = start.y + (start.h - h) / 2;
  if (keepAspect && (north || south) && !(east || west)) x = start.x + (start.w - w) / 2;
  return { x, y, w, h };
}

/** Snap targets: page edges and centre lines plus every other box's edges and centres. */
export function snapTargets(page: { widthPx: number; heightPx: number }, others: Rect[]): { xs: number[]; ys: number[] } {
  const xs = [0, page.widthPx / 2, page.widthPx];
  const ys = [0, page.heightPx / 2, page.heightPx];
  for (const r of others) {
    xs.push(r.x, r.x + r.w / 2, r.x + r.w);
    ys.push(r.y, r.y + r.h / 2, r.y + r.h);
  }
  return { xs, ys };
}

function nearest(candidates: number[], targets: number[], threshold: number): { delta: number; at: number } | null {
  let best: { delta: number; at: number } | null = null;
  for (const c of candidates) {
    for (const t of targets) {
      const delta = t - c;
      if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, at: t };
    }
  }
  return best;
}

/** Snap a moving box's left/centre/right and top/middle/bottom to the closest targets. */
export function snapMove(
  rect: Rect,
  targets: { xs: number[]; ys: number[] },
  threshold: number,
): { rect: Rect; guides: Guide[] } {
  const guides: Guide[] = [];
  const sx = nearest([rect.x, rect.x + rect.w / 2, rect.x + rect.w], targets.xs, threshold);
  const sy = nearest([rect.y, rect.y + rect.h / 2, rect.y + rect.h], targets.ys, threshold);
  const out = { ...rect };
  if (sx) {
    out.x += sx.delta;
    guides.push({ axis: "x", at: sx.at });
  }
  if (sy) {
    out.y += sy.delta;
    guides.push({ axis: "y", at: sy.at });
  }
  return { rect: out, guides };
}

export const pctToPx = (r: Rect, page: { widthPx: number; heightPx: number }): Rect => ({
  x: (r.x / 100) * page.widthPx,
  y: (r.y / 100) * page.heightPx,
  w: (r.w / 100) * page.widthPx,
  h: (r.h / 100) * page.heightPx,
});

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Keep a % box inside what design validation accepts (position −50…150, size 0.5…200). */
export const clampPct = (r: Rect): Rect => ({
  x: Math.min(150, Math.max(-50, r.x)),
  y: Math.min(150, Math.max(-50, r.y)),
  w: Math.min(200, Math.max(0.5, r.w)),
  h: Math.min(200, Math.max(0.5, r.h)),
});

/**
 * Font sizes are stored as % of page height but shown in points, as they will
 * print: the PDF page's long edge is 842 pt (A4), so an A4-landscape page is
 * 595 pt tall and 4 % ≈ 23.8 pt.
 */
export function pctToPt(sizePct: number, page: { widthPx: number; heightPx: number }): number {
  const pageHeightPt = (page.heightPx * 842) / Math.max(page.widthPx, page.heightPx);
  return Math.round(((sizePct / 100) * pageHeightPt) * 10) / 10;
}

export function ptToPct(pt: number, page: { widthPx: number; heightPx: number }): number {
  const pageHeightPt = (page.heightPx * 842) / Math.max(page.widthPx, page.heightPx);
  return Math.round((pt / pageHeightPt) * 100 * 100) / 100;
}

export const pxToPct = (r: Rect, page: { widthPx: number; heightPx: number }): Rect => ({
  x: r3((r.x / page.widthPx) * 100),
  y: r3((r.y / page.heightPx) * 100),
  w: r3((r.w / page.widthPx) * 100),
  h: r3((r.h / page.heightPx) * 100),
});
```

`src/components/admin/certificates/designer-state.ts`:

```ts
import type { AssetRef, Design, DesignElement } from "@/lib/certificates/design";

/**
 * The certificate editor's state machine — pure, so undo/redo, selection and
 * layer ordering are unit-tested. Every design change goes through `update`;
 * consecutive updates sharing a `key` (one drag, one slider, one typing
 * session) collapse into a single undo step.
 */

export const UNDO_LIMIT = 100;

export interface EditorState {
  design: Design;
  selection: string[];
  /** Text element currently open in the in-place editor. */
  editingId: string | null;
  past: Design[];
  future: Design[];
  /** Key of the last recorded change, for coalescing. */
  lastKey: string | null;
  dirty: boolean;
}

export type ElementPatch = Partial<Omit<DesignElement, "id" | "type">> & Record<string, unknown>;

export type EditorAction =
  | { type: "select"; ids: string[] }
  | { type: "toggleSelect"; id: string }
  | { type: "startEdit"; id: string }
  | { type: "endEdit" }
  | { type: "update"; changes: { id: string; patch: ElementPatch }[]; key?: string }
  | { type: "setTemplate"; template: AssetRef }
  | { type: "add"; element: DesignElement }
  | { type: "deleteSelected" }
  | { type: "duplicateSelected"; newId: () => string }
  | { type: "reorder"; id: string; to: "up" | "down" | "front" | "back" }
  | { type: "replaceDesign"; design: Design }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "markSaved" };

export function initEditorState(design: Design): EditorState {
  return { design, selection: [], editingId: null, past: [], future: [], lastKey: null, dirty: false };
}

/** Record `next` as a new undo step (or merge into the previous one when `key` matches). */
function commit(state: EditorState, next: Design, key: string | null = null): EditorState {
  const coalesce = key !== null && key === state.lastKey;
  const past = coalesce ? state.past : [...state.past, state.design].slice(-UNDO_LIMIT);
  return { ...state, design: next, past, future: [], lastKey: key, dirty: true };
}

const withElements = (design: Design, elements: DesignElement[]): Design => ({ ...design, elements });

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const { design } = state;
  switch (action.type) {
    case "select":
      return { ...state, selection: action.ids, editingId: action.ids.includes(state.editingId ?? "") ? state.editingId : null, lastKey: null };

    case "toggleSelect": {
      const on = state.selection.includes(action.id);
      return { ...state, selection: on ? state.selection.filter((i) => i !== action.id) : [...state.selection, action.id], editingId: null, lastKey: null };
    }

    case "startEdit": {
      const el = design.elements.find((e) => e.id === action.id);
      if (!el || el.type !== "text" || el.locked) return state;
      return { ...state, selection: [action.id], editingId: action.id, lastKey: null };
    }

    case "endEdit":
      return { ...state, editingId: null, lastKey: null };

    case "update": {
      const byId = new Map(action.changes.map((c) => [c.id, c.patch]));
      let changed = false;
      const elements = design.elements.map((el) => {
        const patch = byId.get(el.id);
        if (!patch) return el;
        changed = true;
        return { ...el, ...patch } as DesignElement;
      });
      return changed ? commit(state, withElements(design, elements), action.key ?? null) : state;
    }

    case "setTemplate":
      return commit(state, {
        ...design,
        page: { template: action.template, widthPx: action.template.widthPx, heightPx: action.template.heightPx },
      });

    case "add":
      return { ...commit(state, withElements(design, [...design.elements, action.element])), selection: [action.element.id], editingId: null };

    case "deleteSelected": {
      if (state.selection.length === 0) return state;
      const keep = design.elements.filter((el) => !state.selection.includes(el.id) || el.locked);
      if (keep.length === design.elements.length) return state;
      return { ...commit(state, withElements(design, keep)), selection: [], editingId: null };
    }

    case "duplicateSelected": {
      const copies = design.elements
        .filter((el) => state.selection.includes(el.id))
        .map((el) => ({ ...structuredClone(el), id: action.newId(), name: `${el.name} copy`.slice(0, 60), x: el.x + 2, y: el.y + 2, locked: false }));
      if (copies.length === 0) return state;
      return { ...commit(state, withElements(design, [...design.elements, ...copies])), selection: copies.map((c) => c.id), editingId: null };
    }

    case "reorder": {
      const from = design.elements.findIndex((el) => el.id === action.id);
      if (from < 0) return state;
      const last = design.elements.length - 1;
      const to = { up: Math.min(last, from + 1), down: Math.max(0, from - 1), front: last, back: 0 }[action.to];
      if (to === from) return state;
      const elements = [...design.elements];
      const [moved] = elements.splice(from, 1);
      elements.splice(to, 0, moved);
      return commit(state, withElements(design, elements));
    }

    case "replaceDesign":
      return { ...commit(state, action.design), selection: [], editingId: null };

    case "undo": {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      return { ...state, design: prev, past: state.past.slice(0, -1), future: [design, ...state.future], lastKey: null, dirty: true, editingId: null, selection: state.selection.filter((id) => prev.elements.some((e) => e.id === id)) };
    }

    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return { ...state, design: next, past: [...state.past, design], future: state.future.slice(1), lastKey: null, dirty: true, editingId: null, selection: state.selection.filter((id) => next.elements.some((e) => e.id === id)) };
    }

    case "markSaved":
      return { ...state, dirty: false, lastKey: null };
  }
}
```

`src/components/admin/certificates/image-prep.ts`:

```ts
/**
 * Getting a picked file ready to upload (spec §6.3): pdf-lib embeds only PNG
 * and JPEG, so SVG/WebP are rasterised; oversized templates are scaled down to
 * A4 at 300 dpi; big opaque PNG templates become JPEG. JPEGs are always redrawn:
 * a phone photo's EXIF rotation is applied by the browser but ignored by
 * pdf-lib, so only baked-in pixels print the way the editor shows them.
 * The decisions are pure (`planImagePrep`); `prepareImage` does the canvas work.
 */

export type AssetKind = "template" | "image";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const TEMPLATE_BOX = { long: 3508, short: 2480 };
const IMAGE_LONG_EDGE = 2000;
const PNG_TO_JPEG_BYTES = 3 * 1024 * 1024;
const ACCEPTED = new Set(["image/png", "image/jpeg", "image/svg+xml", "image/webp"]);

export interface PrepPlan {
  /** Draw through a canvas (convert and/or resize) instead of uploading the file as-is. */
  redraw: boolean;
  width: number;
  height: number;
  /** Output format when redrawing; "auto" = JPEG if the pixels turn out opaque, else PNG. */
  output: "png" | "jpeg" | "auto";
}

export function isAcceptedImage(mime: string): boolean {
  return ACCEPTED.has(mime);
}

/** Largest size within the limit for this kind, keeping the aspect ratio (never upscales). */
export function fitSize(width: number, height: number, kind: AssetKind): { width: number; height: number } {
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  const scale =
    kind === "template"
      ? Math.min(1, TEMPLATE_BOX.long / long, TEMPLATE_BOX.short / short)
      : Math.min(1, IMAGE_LONG_EDGE / long);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function planImagePrep(file: { type: string; size: number }, natural: { width: number; height: number }, kind: AssetKind): PrepPlan {
  const target = fitSize(natural.width, natural.height, kind);
  const resized = target.width !== natural.width || target.height !== natural.height;
  const png = file.type === "image/png";
  const heavyPngTemplate = kind === "template" && png && file.size > PNG_TO_JPEG_BYTES;
  const output: PrepPlan["output"] =
    file.type === "image/jpeg" ? "jpeg" : heavyPngTemplate || (kind === "template" && !png) ? "auto" : "png";
  return { redraw: !png || resized || heavyPngTemplate, ...target, output };
}

export interface PreparedImage {
  blob: Blob;
  type: "png" | "jpg";
  width: number;
  height: number;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file isn't an image the browser can read."));
    img.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the image."))), type, quality),
  );
}

/** Browser only. Throws with a user-facing message. */
export async function prepareImage(file: File, kind: AssetKind): Promise<PreparedImage> {
  if (!isAcceptedImage(file.type)) throw new Error("Use a PNG, JPEG, SVG or WebP image.");
  const img = await loadImage(file);
  // SVGs without an intrinsic size report 0 — give them a sensible canvas.
  const natural = { width: img.naturalWidth || 1200, height: img.naturalHeight || 1200 };
  const plan = planImagePrep(file, natural, kind);

  let prepared: PreparedImage;
  if (!plan.redraw) {
    prepared = { blob: file, type: file.type === "image/png" ? "png" : "jpg", width: natural.width, height: natural.height };
  } else {
    const canvas = document.createElement("canvas");
    canvas.width = plan.width;
    canvas.height = plan.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't prepare images.");
    ctx.drawImage(img, 0, 0, plan.width, plan.height);
    let opaque = false;
    if (plan.output === "auto") {
      const { data } = ctx.getImageData(0, 0, plan.width, plan.height);
      opaque = true;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 255) {
          opaque = false;
          break;
        }
      }
    }
    prepared =
      plan.output === "jpeg" || opaque
        ? { blob: await toBlob(canvas, "image/jpeg", 0.92), type: "jpg", width: plan.width, height: plan.height }
        : { blob: await toBlob(canvas, "image/png"), type: "png", width: plan.width, height: plan.height };
  }
  if (prepared.blob.size > MAX_UPLOAD_BYTES) throw new Error("That image is still over 8 MB after preparing it — use a smaller file.");
  return prepared;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/admin/certificates`
Expected: PASS, 27 tests (9 geometry + 10 state + 8 image prep).

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/certificates/geometry.ts src/components/admin/certificates/geometry.test.ts src/components/admin/certificates/designer-state.ts src/components/admin/certificates/designer-state.test.ts src/components/admin/certificates/image-prep.ts src/components/admin/certificates/image-prep.test.ts
git commit -m "feat(certificates): editor geometry, undoable state and image preparation

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Editor UI components and styles

**Files:**
- Create in `src/components/admin/certificates/`:
  - `cert-field-node.ts`, `TextSvg.tsx`, `useTextEditor.ts`, `Canvas.tsx`, `FieldMenu.tsx`
  - `LayersPanel.tsx`, `PropertiesPanel.tsx`, `upload.ts`, `CertificateDesigner.tsx`, `DesignerLoader.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: everything from Tasks 1–5 and 10; `createCertificateUploadAction`, `saveCertificateDesignAction`, `copyCertificateDesignAction` (Task 9); `createClient` (`src/lib/supabase/client.ts`).
- Produces:
  - `CertificateDesignerProps`: `eventId`, `groupId`, `initialDesign`, `initialAssetUrls`, `catalogue`, `previewRecipients: PreviewRecipient[]`, `issuedCount`, `designSources: DesignSource[]`, `offline?`
  - Components: `CertificateDesigner`, `DesignerLoader` (client-only dynamic wrapper, same props)
  - Types: `PreviewRecipient { key; name; values }`, `DesignSource { eventId; title; date }`

- [ ] **Step 1: The field chip node, SVG text and editor hook**

`src/components/admin/certificates/cert-field-node.ts`:

```ts
import { Node, mergeAttributes } from "@tiptap/core";
import { FIELD_NODE } from "@/lib/certificates/rich-text";

/**
 * The inline field chip inside the in-place text editor — an atom node that
 * reads as {Name}. Its attributes map 1:1 onto a `field` run (rich-text.ts).
 */
export interface CertFieldOptions {
  labelFor: (key: string) => string;
}

export const CertField = Node.create<CertFieldOptions>({
  name: FIELD_NODE,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { labelFor: (key: string) => key };
  },

  addAttributes() {
    return {
      field: { default: "person.name", rendered: false },
      transform: { default: "none", rendered: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-cert-field]",
        getAttrs: (el) => ({
          field: (el as HTMLElement).dataset.certField ?? "person.name",
          transform: (el as HTMLElement).dataset.transform ?? "none",
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-cert-field": node.attrs.field,
        "data-transform": node.attrs.transform,
        class: "cd-chip",
        contenteditable: "false",
      }),
      `{${this.options.labelFor(String(node.attrs.field))}}`,
    ];
  },

  renderText({ node }) {
    return `{${this.options.labelFor(String(node.attrs.field))}}`;
  },
});
```

`src/components/admin/certificates/TextSvg.tsx`:

```tsx
import { cssFamily } from "@/lib/certificates/fonts";
import type { TextLayout } from "@/lib/certificates/layout";

/**
 * Draw a laid-out text element in the editor's page-sized SVG. Every run is
 * placed at the x the layout engine computed, so the browser never wraps or
 * kerns — the same numbers go into the PDF.
 */
export function TextSvg({ layout }: { layout: TextLayout }) {
  return (
    <g>
      {layout.lines.map((line, li) =>
        line.runs.map((run, ri) => (
          <g key={`${li}.${ri}`}>
            <text
              className="cd-text"
              x={run.x}
              y={line.baseline}
              fontFamily={cssFamily(run.family)}
              fontWeight={run.bold ? 700 : 400}
              fontStyle={run.italic ? "italic" : "normal"}
              fontSize={run.size}
              fill={run.color}
              xmlSpace="preserve"
            >
              {run.text}
            </text>
            {run.underline ? (
              <rect x={run.x} y={run.underline.y} width={run.width} height={run.underline.thickness} fill={run.color} />
            ) : null}
          </g>
        )),
      )}
    </g>
  );
}
```

`src/components/admin/certificates/useTextEditor.ts`:

```ts
"use client";

import { useEffect, useRef } from "react";
import { useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Color, FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { DEFAULT_STYLE, type Paragraph, type TextElement } from "@/lib/certificates/design";
import { docToParagraphs, paragraphsToDoc, primaryStyle, type PMNode } from "@/lib/certificates/rich-text";
import { CertField } from "./cert-field-node";

/**
 * A TipTap editor bound to the text element being edited in place. Recreated
 * whenever a different element opens; every change is reported as paragraphs.
 */
export function useTextEditor(opts: {
  element: TextElement | null;
  pageHeightPx: number;
  fieldLabel: (key: string) => string;
  onChange: (paragraphs: Paragraph[]) => void;
}): Editor | null {
  // Latest callbacks, read only from TipTap's event handlers (never during render).
  const onChange = useRef(opts.onChange);
  const label = useRef(opts.fieldLabel);
  useEffect(() => {
    onChange.current = opts.onChange;
    label.current = opts.fieldLabel;
  });
  const { element, pageHeightPx } = opts;

  return useEditor(
    {
      immediatelyRender: false,
      shouldRerenderOnTransaction: true,
      editable: !!element,
      autofocus: element ? "end" : false,
      extensions: [
        StarterKit.configure({
          blockquote: false,
          bulletList: false,
          code: false,
          codeBlock: false,
          dropcursor: false,
          gapcursor: false,
          hardBreak: false,
          heading: false,
          horizontalRule: false,
          link: false,
          listItem: false,
          listKeymap: false,
          orderedList: false,
          strike: false,
          trailingNode: false,
        }),
        TextStyle,
        Color,
        FontFamily,
        FontSize,
        CertField.configure({ labelFor: (key) => label.current(key) }),
      ],
      content: element ? paragraphsToDoc(element.paragraphs, pageHeightPx) : { type: "doc", content: [{ type: "paragraph" }] },
      onUpdate: ({ editor }) => {
        if (!element) return;
        const fallback = primaryStyle(element.paragraphs, DEFAULT_STYLE);
        onChange.current(docToParagraphs(editor.getJSON() as PMNode, pageHeightPx, fallback));
      },
    },
    [element?.id, pageHeightPx],
  );
}
```

- [ ] **Step 2: The canvas**

`src/components/admin/certificates/Canvas.tsx`:

```tsx
"use client";

import { useMemo, useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent } from "react";
import { EditorContent, type Editor } from "@tiptap/react";
import { assetKey, type DesignElement, type TextElement } from "@/lib/certificates/design";
import { layoutText, type TextLayout } from "@/lib/certificates/layout";
import { METRICS } from "@/lib/certificates/metrics";
import type { EditorAction, EditorState } from "./designer-state";
import {
  clampPct,
  pctToPx,
  pxToPct,
  resizeRect,
  snapMove,
  snapTargets,
  type Guide,
  type Handle,
  type Rect,
} from "./geometry";
import { TextSvg } from "./TextSvg";

type Drag =
  | { kind: "move"; startX: number; startY: number; key: string; primary: string; origins: Map<string, Rect> }
  | { kind: "resize"; startX: number; startY: number; key: string; id: string; handle: Handle; origin: Rect };

const ALL_HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const SIDE_HANDLES: Handle[] = ["e", "w"];
/** Snap distance in screen pixels. */
const SNAP_PX = 6;

export interface CanvasProps {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  zoom: number;
  assetUrls: Record<string, string>;
  valueFor: (field: string) => string;
  editor: Editor | null;
}

export function Canvas({ state, dispatch, zoom, assetUrls, valueFor, editor }: CanvasProps) {
  const { design, selection, editingId } = state;
  const page = design.page;
  const drag = useRef<Drag | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);

  const layouts = useMemo(() => {
    const map = new Map<string, TextLayout>();
    for (const el of design.elements) {
      if (el.type === "text") map.set(el.id, layoutText(el, valueFor, page, METRICS));
    }
    return map;
  }, [design.elements, page, valueFor]);

  /** The on-screen box of an element in page px — a wrap text box is as tall as its text. */
  const boxOf = (el: DesignElement): Rect => {
    const r = pctToPx(el, page);
    const layout = el.type === "text" && el.fit === "wrap" ? layouts.get(el.id) : undefined;
    return layout ? { ...r, h: Math.max(layout.height, 1) } : r;
  };

  function startMove(e: ReactPointerEvent<HTMLDivElement>, el: DesignElement) {
    if (e.button !== 0 || editingId === el.id) return;
    e.stopPropagation();
    if (e.shiftKey) {
      dispatch({ type: "toggleSelect", id: el.id });
      return;
    }
    const ids = selection.includes(el.id) ? selection : [el.id];
    if (!selection.includes(el.id)) dispatch({ type: "select", ids });
    const movable = design.elements.filter((x) => ids.includes(x.id) && !x.locked);
    if (movable.length === 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      kind: "move",
      startX: e.clientX,
      startY: e.clientY,
      key: `move-${e.timeStamp}`,
      primary: movable.some((m) => m.id === el.id) ? el.id : movable[0].id,
      origins: new Map(movable.map((m) => [m.id, boxOf(m)])),
    };
  }

  function startResize(e: ReactPointerEvent<HTMLDivElement>, el: DesignElement, handle: Handle) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { kind: "resize", startX: e.clientX, startY: e.clientY, key: `resize-${e.timeStamp}`, id: el.id, handle, origin: boxOf(el) };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / zoom;
    const dy = (e.clientY - d.startY) / zoom;

    if (d.kind === "move") {
      const origin = d.origins.get(d.primary)!;
      let offX = dx;
      let offY = dy;
      let nextGuides: Guide[] = [];
      if (!e.altKey) {
        const others = design.elements.filter((x) => !d.origins.has(x.id) && !x.hidden).map(boxOf);
        const snapped = snapMove({ ...origin, x: origin.x + dx, y: origin.y + dy }, snapTargets(page, others), SNAP_PX / zoom);
        offX = snapped.rect.x - origin.x;
        offY = snapped.rect.y - origin.y;
        nextGuides = snapped.guides;
      }
      setGuides(nextGuides);
      dispatch({
        type: "update",
        key: d.key,
        changes: [...d.origins].map(([id, r]) => {
          const pct = clampPct(pxToPct({ ...r, x: r.x + offX, y: r.y + offY }, page));
          return { id, patch: { x: pct.x, y: pct.y } };
        }),
      });
      return;
    }

    const el = design.elements.find((x) => x.id === d.id);
    if (!el) return;
    const keepAspect = el.type === "image" && !e.shiftKey;
    const pct = clampPct(pxToPct(resizeRect(d.origin, d.handle, dx, dy, keepAspect), page));
    const wrap = el.type === "text" && el.fit === "wrap";
    dispatch({
      type: "update",
      key: d.key,
      changes: [{ id: d.id, patch: wrap ? { x: pct.x, w: pct.w } : { x: pct.x, y: pct.y, w: pct.w, h: pct.h } }],
    });
  }

  function endDrag() {
    drag.current = null;
    setGuides([]);
  }

  const selected = design.elements.filter((el) => selection.includes(el.id) && !el.hidden);
  const single = selected.length === 1 ? selected[0] : null;
  const editing = design.elements.find((el): el is TextElement => el.id === editingId && el.type === "text") ?? null;
  const templateUrl = page.template ? assetUrls[assetKey(page.template)] : undefined;

  return (
    <div
      className="cd-stage"
      style={{ width: page.widthPx * zoom, height: page.heightPx * zoom }}
      // Hit boxes, handles and the text editor stop propagation, so anything
      // reaching the stage is a click on empty page: deselect (and end editing).
      onPointerDown={() => dispatch({ type: "select", ids: [] })}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <svg
        className="cd-svg"
        viewBox={`0 0 ${page.widthPx} ${page.heightPx}`}
        width={page.widthPx * zoom}
        height={page.heightPx * zoom}
      >
        <rect width={page.widthPx} height={page.heightPx} fill="#ffffff" />
        {templateUrl ? (
          <image href={templateUrl} x={0} y={0} width={page.widthPx} height={page.heightPx} preserveAspectRatio="none" />
        ) : null}
        {design.elements.map((el) => {
          if (el.hidden || el.id === editingId) return null;
          if (el.type === "image") {
            const r = pctToPx(el, page);
            const url = assetUrls[assetKey(el.asset)];
            return url ? (
              <image key={el.id} href={url} x={r.x} y={r.y} width={r.w} height={r.h} opacity={el.opacity} preserveAspectRatio="none" />
            ) : (
              <rect key={el.id} x={r.x} y={r.y} width={r.w} height={r.h} fill="#eeeeee" />
            );
          }
          const layout = layouts.get(el.id);
          return layout ? <TextSvg key={el.id} layout={layout} /> : null;
        })}
        {guides.map((g, i) =>
          g.axis === "x" ? (
            <line key={i} className="cd-guide" x1={g.at} x2={g.at} y1={0} y2={page.heightPx} vectorEffect="non-scaling-stroke" />
          ) : (
            <line key={i} className="cd-guide" x1={0} x2={page.widthPx} y1={g.at} y2={g.at} vectorEffect="non-scaling-stroke" />
          ),
        )}
      </svg>

      {design.elements.map((el) => {
        if (el.hidden || el.id === editingId) return null;
        const r = boxOf(el);
        return (
          <div
            key={el.id}
            className={`cd-hit${selection.includes(el.id) ? " is-selected" : ""}${el.locked ? " is-locked" : ""}`}
            style={{ left: r.x * zoom, top: r.y * zoom, width: r.w * zoom, height: r.h * zoom }}
            onPointerDown={(e) => startMove(e, el)}
            onDoubleClick={() => el.type === "text" && dispatch({ type: "startEdit", id: el.id })}
            title={el.name}
          />
        );
      })}

      {single && !single.locked && single.id !== editingId
        ? (single.type === "text" && single.fit === "wrap" ? SIDE_HANDLES : ALL_HANDLES).map((h) => {
            const r = boxOf(single);
            const x = h.includes("w") ? r.x : h.includes("e") ? r.x + r.w : r.x + r.w / 2;
            const y = h.includes("n") ? r.y : h.includes("s") ? r.y + r.h : r.y + r.h / 2;
            return (
              <div
                key={h}
                className={`cd-handle cd-handle-${h}`}
                style={{ left: x * zoom, top: y * zoom }}
                onPointerDown={(e) => startResize(e, single, h)}
              />
            );
          })
        : null}

      {editing && editor ? (
        <div
          className="cd-editing"
          style={{
            left: (editing.x / 100) * page.widthPx * zoom,
            top: (editing.y / 100) * page.heightPx * zoom,
            width: (editing.w / 100) * page.widthPx,
            transform: `scale(${zoom})`,
            textAlign: editing.align,
            lineHeight: editing.lineHeight,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <EditorContent editor={editor} />
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Menus and panels**

`src/components/admin/certificates/FieldMenu.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { FieldTransform } from "@/lib/certificates/design";
import type { FieldGroup } from "@/lib/certificates/fields";

const TRANSFORMS: { id: FieldTransform; label: string }[] = [
  { id: "none", label: "As typed" },
  { id: "title", label: "Title Case" },
  { id: "upper", label: "UPPERCASE" },
];

/** "+ Field" dropdown: every field this event offers, grouped, with a letter-case choice. */
export function FieldMenu({
  catalogue,
  onPick,
  label = "+ Field",
}: {
  catalogue: FieldGroup[];
  onPick: (field: string, transform: FieldTransform, label: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [transform, setTransform] = useState<FieldTransform>("none");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div className="cd-menu" ref={root}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        aria-expanded={open}
        // Keep focus (and the text selection) in the editor while choosing.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
      </button>
      {open ? (
        <div className="cd-menu-panel" role="menu">
          <div className="cd-menu-transforms">
            {TRANSFORMS.map((t) => (
              <button
                key={t.id}
                type="button"
                className="chip"
                aria-pressed={transform === t.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setTransform(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {catalogue.map((group) => (
            <div key={group.id} className="cd-menu-group">
              <div className="label">{group.label}</div>
              {group.fields.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="menuitem"
                  className="cd-menu-item"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onPick(f.key, transform, f.label);
                    setOpen(false);
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

`src/components/admin/certificates/LayersPanel.tsx`:

```tsx
"use client";

import type { Dispatch } from "react";
import type { EditorAction, EditorState } from "./designer-state";

/** Layer list, top layer first: select, hide, lock, move up/down. */
export function LayersPanel({ state, dispatch }: { state: EditorState; dispatch: Dispatch<EditorAction> }) {
  const layers = [...state.design.elements].reverse();
  return (
    <aside className="cd-panel" aria-label="Layers">
      <div className="label">Layers</div>
      {layers.length === 0 ? <p className="hint">Add text, an image or a field.</p> : null}
      <ul className="cd-layers">
        {layers.map((el) => (
          <li key={el.id} className={state.selection.includes(el.id) ? "is-selected" : undefined}>
            <button
              type="button"
              className="cd-layer-name"
              onClick={(e) =>
                dispatch(e.shiftKey ? { type: "toggleSelect", id: el.id } : { type: "select", ids: [el.id] })
              }
            >
              <span aria-hidden>{el.type === "image" ? "▣" : "T"}</span> {el.name}
            </button>
            <button
              type="button"
              className="cd-icon"
              aria-label={el.hidden ? `Show ${el.name}` : `Hide ${el.name}`}
              aria-pressed={el.hidden}
              onClick={() => dispatch({ type: "update", changes: [{ id: el.id, patch: { hidden: !el.hidden } }] })}
            >
              {el.hidden ? "◌" : "●"}
            </button>
            <button
              type="button"
              className="cd-icon"
              aria-label={el.locked ? `Unlock ${el.name}` : `Lock ${el.name}`}
              aria-pressed={el.locked}
              onClick={() => dispatch({ type: "update", changes: [{ id: el.id, patch: { locked: !el.locked } }] })}
            >
              {el.locked ? "🔒" : "🔓"}
            </button>
            <button type="button" className="cd-icon" aria-label={`Move ${el.name} up`} onClick={() => dispatch({ type: "reorder", id: el.id, to: "up" })}>
              ↑
            </button>
            <button type="button" className="cd-icon" aria-label={`Move ${el.name} down`} onClick={() => dispatch({ type: "reorder", id: el.id, to: "down" })}>
              ↓
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
```

`src/components/admin/certificates/PropertiesPanel.tsx`:

```tsx
"use client";

import type { Dispatch } from "react";
import type { Editor } from "@tiptap/react";
import {
  DEFAULT_STYLE,
  type DesignElement,
  type FieldTransform,
  type Style,
  type TextElement,
} from "@/lib/certificates/design";
import { cssFamily, familyFromCss, FONT_FAMILIES, hasVariant, type FontFamilyId } from "@/lib/certificates/fonts";
import { layoutText } from "@/lib/certificates/layout";
import { METRICS } from "@/lib/certificates/metrics";
import { applyStyleToAll, listFieldRuns, primaryStyle, setFieldTransform } from "@/lib/certificates/rich-text";
import type { EditorAction, EditorState } from "./designer-state";
import { pctToPt, ptToPct } from "./geometry";

interface Props {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  editor: Editor | null;
  valueFor: (field: string) => string;
  fieldLabel: (key: string) => string;
}

export function PropertiesPanel({ state, dispatch, editor, valueFor, fieldLabel }: Props) {
  const selected = state.design.elements.filter((el) => state.selection.includes(el.id));
  if (selected.length === 0) {
    return (
      <aside className="cd-panel" aria-label="Properties">
        <div className="label">Properties</div>
        <p className="hint">
          Select something on the certificate. Double-click text to type; use <strong>+ Field</strong> while typing to
          insert a name, team or event detail.
        </p>
      </aside>
    );
  }
  if (selected.length > 1) {
    return (
      <aside className="cd-panel" aria-label="Properties">
        <div className="label">{selected.length} selected</div>
        <p className="hint">Drag to move them together, or press Delete.</p>
      </aside>
    );
  }
  const el = selected[0];
  const set = (patch: Partial<DesignElement>, key: string) =>
    dispatch({ type: "update", key: `prop-${el.id}-${key}`, changes: [{ id: el.id, patch }] });

  return (
    <aside className="cd-panel" aria-label="Properties">
      <div className="label">{el.type === "image" ? "Image" : "Text"}</div>

      <label className="cd-row">
        <span>Name</span>
        <input value={el.name} maxLength={60} onChange={(e) => set({ name: e.target.value || "Untitled" }, "name")} />
      </label>

      <div className="cd-grid2">
        <NumberField label="X %" value={el.x} onChange={(x) => set({ x }, "x")} />
        <NumberField label="Y %" value={el.y} onChange={(y) => set({ y }, "y")} />
        <NumberField label="W %" value={el.w} min={0.5} onChange={(w) => set({ w }, "w")} />
        {el.type === "text" && el.fit === "wrap" ? null : (
          <NumberField label="H %" value={el.h} min={0.5} onChange={(h) => set({ h }, "h")} />
        )}
      </div>

      {el.type === "image" ? (
        <label className="cd-row">
          <span>Opacity</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={el.opacity}
            onChange={(e) => set({ opacity: Number(e.target.value) }, "opacity")}
          />
        </label>
      ) : (
        <TextProperties el={el} state={state} dispatch={dispatch} editor={editor} valueFor={valueFor} fieldLabel={fieldLabel} />
      )}

      <div className="cd-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => dispatch({ type: "reorder", id: el.id, to: "front" })}>
          To front
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => dispatch({ type: "reorder", id: el.id, to: "back" })}>
          To back
        </button>
        <button type="button" className="btn btn-ghost btn-sm" aria-pressed={el.locked} onClick={() => set({ locked: !el.locked }, "locked")}>
          {el.locked ? "Unlock" : "Lock"}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={el.locked}
          onClick={() => dispatch({ type: "deleteSelected" })}
        >
          Delete
        </button>
      </div>
    </aside>
  );
}

function TextProperties({
  el,
  state,
  dispatch,
  editor,
  valueFor,
  fieldLabel,
}: {
  el: TextElement;
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  editor: Editor | null;
  valueFor: (field: string) => string;
  fieldLabel: (key: string) => string;
}) {
  const page = state.design.page;
  const editing = state.editingId === el.id && editor ? editor : null;
  const base = primaryStyle(el.paragraphs, DEFAULT_STYLE);

  // What the controls show: the style at the cursor while typing, else the box's first run.
  let style: Style = base;
  if (editing) {
    const attrs = editing.getAttributes("textStyle") as { fontFamily?: string; fontSize?: string; color?: string };
    const px = attrs.fontSize ? parseFloat(attrs.fontSize) : NaN;
    style = {
      font: (attrs.fontFamily && familyFromCss(attrs.fontFamily)) || base.font,
      sizePct: Number.isFinite(px) ? (px / page.heightPx) * 100 : base.sizePct,
      bold: editing.isActive("bold"),
      italic: editing.isActive("italic"),
      underline: editing.isActive("underline"),
      color: attrs.color && /^#[0-9a-f]{6}$/i.test(attrs.color) ? attrs.color.toLowerCase() : base.color,
    };
  }

  const setBox = (patch: Partial<TextElement>, key: string) =>
    dispatch({ type: "update", key: `prop-${el.id}-${key}`, changes: [{ id: el.id, patch }] });

  function applyStyle(patch: Partial<Style>) {
    if (!editing) {
      setBox({ paragraphs: applyStyleToAll(el.paragraphs, patch) }, `style-${Object.keys(patch).join("")}`);
      return;
    }
    // Nothing selected: style the whole box, like the panel does when not typing.
    let chain = editing.chain().focus();
    if (editing.state.selection.empty) chain = chain.selectAll();
    const next = { ...style, ...patch };
    if (patch.font) chain = chain.setFontFamily(cssFamily(patch.font));
    if (patch.sizePct !== undefined) chain = chain.setFontSize(`${(patch.sizePct / 100) * page.heightPx}px`);
    if (patch.color) chain = chain.setColor(patch.color);
    if (patch.bold !== undefined) chain = patch.bold ? chain.setBold() : chain.unsetBold();
    if (patch.italic !== undefined) chain = patch.italic ? chain.setItalic() : chain.unsetItalic();
    if (patch.underline !== undefined) chain = patch.underline ? chain.setUnderline() : chain.unsetUnderline();
    if (patch.font && !hasVariant(next.font, next.bold, next.italic)) chain = chain.unsetBold().unsetItalic();
    chain.run();
  }

  const layout = layoutText(el, valueFor, page, METRICS);
  const fields = editing ? [] : listFieldRuns(el.paragraphs);

  return (
    <>
      <div className="cd-row">
        <span>Align</span>
        <div className="stack">
          {(["left", "center", "right"] as const).map((a) => (
            <button key={a} type="button" className="chip" aria-pressed={el.align === a} onClick={() => setBox({ align: a }, "align")}>
              {a}
            </button>
          ))}
        </div>
      </div>
      <div className="cd-grid2">
        <label className="cd-row">
          <span>Fit</span>
          <select value={el.fit} onChange={(e) => setBox({ fit: e.target.value as TextElement["fit"] }, "fit")}>
            <option value="wrap">Wrap lines</option>
            <option value="shrink">Shrink to one line</option>
          </select>
        </label>
        <NumberField label="Line spacing" value={el.lineHeight} step={0.05} min={0.8} max={3} onChange={(lineHeight) => setBox({ lineHeight }, "lh")} />
      </div>

      <div className="label" style={{ marginTop: 10 }}>
        {editing ? "Style (selection)" : "Style (whole box)"}
      </div>
      <label className="cd-row">
        <span>Font</span>
        <select
          value={style.font}
          onMouseDown={(e) => editing && e.stopPropagation()}
          onChange={(e) => applyStyle({ font: e.target.value as FontFamilyId })}
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <div className="cd-grid2">
        <NumberField
          label="Size pt"
          value={pctToPt(style.sizePct, page)}
          step={0.5}
          min={1}
          onChange={(pt) => applyStyle({ sizePct: Math.min(30, Math.max(0.5, ptToPct(pt, page))) })}
        />
        <label className="cd-row">
          <span>Colour</span>
          <input type="color" value={style.color} onChange={(e) => applyStyle({ color: e.target.value.toLowerCase() })} />
        </label>
      </div>
      <div className="stack">
        <button
          type="button"
          className="chip"
          aria-pressed={style.bold}
          disabled={!hasVariant(style.font, !style.bold, style.italic)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyStyle({ bold: !style.bold })}
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={style.italic}
          disabled={!hasVariant(style.font, style.bold, !style.italic)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyStyle({ italic: !style.italic })}
        >
          <em>I</em>
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={style.underline}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyStyle({ underline: !style.underline })}
        >
          <u>U</u>
        </button>
      </div>

      {fields.length > 0 ? (
        <>
          <div className="label" style={{ marginTop: 10 }}>
            Fields in this box
          </div>
          {fields.map((f) => (
            <label key={`${f.paragraph}.${f.run}`} className="cd-row">
              <span>{`{${fieldLabel(f.field)}}`}</span>
              <select
                value={f.transform}
                onChange={(e) =>
                  setBox({ paragraphs: setFieldTransform(el.paragraphs, f, e.target.value as FieldTransform) }, `tf-${f.paragraph}-${f.run}`)
                }
              >
                <option value="none">As typed</option>
                <option value="title">Title Case</option>
                <option value="upper">UPPERCASE</option>
              </select>
            </label>
          ))}
        </>
      ) : null}

      {layout.overflow ? (
        <p className="hint cd-warn">
          {el.fit === "shrink" ? "This text is too long for the box even at its smallest." : "This text runs off the page."}
        </p>
      ) : null}
      {layout.missingGlyphs.length ? (
        <p className="hint cd-warn">This font can&rsquo;t print: {layout.missingGlyphs.join(" ")}</p>
      ) : null}
    </>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 0.1,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <label className="cd-row">
      <span>{label}</span>
      <input
        type="number"
        value={Math.round(value * 100) / 100}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(v)) onChange(v);
        }}
      />
    </label>
  );
}
```

- [ ] **Step 4: Upload helper, the designer and its client-only loader**

`src/components/admin/certificates/upload.ts`:

```ts
"use client";

import { createClient } from "@/lib/supabase/client";
import { createCertificateUploadAction } from "@/app/admin/(app)/events/[id]/certificates/actions";
import { CERT_ASSET_BUCKET, type AssetRef } from "@/lib/certificates/design";
import { prepareImage, type AssetKind } from "./image-prep";

/**
 * Prepare a picked image in the browser, then upload it straight to the
 * private certificate-assets bucket through a one-path signed upload URL
 * (spec §6.4) — no server-action body limit involved. Returns the asset ref
 * plus a local object URL to show it immediately. Throws a user-facing Error.
 */
export async function uploadCertificateAsset(
  eventId: string,
  file: File,
  kind: AssetKind,
): Promise<{ ref: AssetRef; localUrl: string }> {
  const prepared = await prepareImage(file, kind);
  const contentType = prepared.type === "png" ? "image/png" : "image/jpeg";
  const ticket = await createCertificateUploadAction({ eventId, contentType, size: prepared.blob.size });
  if (!ticket.ok) throw new Error(ticket.error);

  const { error } = await createClient()
    .storage.from(CERT_ASSET_BUCKET)
    .uploadToSignedUrl(ticket.path, ticket.token, prepared.blob, { contentType });
  if (error) throw new Error("Upload failed. Check your connection and try again.");

  return {
    ref: { bucket: CERT_ASSET_BUCKET, path: ticket.path, type: prepared.type, widthPx: prepared.width, heightPx: prepared.height },
    localUrl: URL.createObjectURL(prepared.blob),
  };
}
```

`src/components/admin/certificates/CertificateDesigner.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useTransition } from "react";
import {
  copyCertificateDesignAction,
  saveCertificateDesignAction,
} from "@/app/admin/(app)/events/[id]/certificates/actions";
import {
  DEFAULT_STYLE,
  assetKey,
  newElementId,
  type Design,
  type FieldTransform,
  type TextElement,
} from "@/lib/certificates/design";
import { fieldLabel as labelOf, fieldNameValue, type FieldGroup, type FieldValues } from "@/lib/certificates/fields";
import { fontFaceCss } from "@/lib/certificates/fonts";
import { FIELD_NODE } from "@/lib/certificates/rich-text";
import { Canvas } from "./Canvas";
import { editorReducer, initEditorState } from "./designer-state";
import { FieldMenu } from "./FieldMenu";
import { clampPct } from "./geometry";
import type { AssetKind } from "./image-prep";
import { LayersPanel } from "./LayersPanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { uploadCertificateAsset } from "./upload";
import { useTextEditor } from "./useTextEditor";

const FONT_CSS = fontFaceCss();
const ZOOMS = [0.1, 0.25, 0.5, 1] as const;

export interface PreviewRecipient {
  key: string;
  name: string;
  values: FieldValues;
}

export interface DesignSource {
  eventId: string;
  title: string;
  date: string;
}

export interface CertificateDesignerProps {
  eventId: string;
  groupId: string;
  initialDesign: Design;
  initialAssetUrls: Record<string, string>;
  catalogue: FieldGroup[];
  previewRecipients: PreviewRecipient[];
  issuedCount: number;
  designSources: DesignSource[];
  /** Dev harness only: no uploads, saves or previews. */
  offline?: boolean;
}

type Busy = "upload" | "preview" | "copy" | null;

export function CertificateDesigner(props: CertificateDesignerProps) {
  const { eventId, groupId, catalogue } = props;
  const [state, dispatch] = useReducer(editorReducer, props.initialDesign, initEditorState);
  const [assetUrls, setAssetUrls] = useState(props.initialAssetUrls);
  const [zoomMode, setZoomMode] = useState<"fit" | number>("fit");
  const [fitZoom, setFitZoom] = useState(0.2);
  const [previewKey, setPreviewKey] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [saving, startSaving] = useTransition();
  const [copyFrom, setCopyFrom] = useState("");
  const [confirmCopy, setConfirmCopy] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const templateInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const latestDesign = useRef(state.design);
  useEffect(() => {
    latestDesign.current = state.design;
  }, [state.design]);

  const page = state.design.page;
  const zoom = zoomMode === "fit" ? fitZoom : zoomMode;

  const fieldLabel = useCallback((key: string) => labelOf(catalogue, key), [catalogue]);
  const previewValues = props.previewRecipients.find((r) => r.key === previewKey)?.values;
  const valueFor = useMemo(
    () => (previewValues ? (k: string) => previewValues[k] ?? "" : fieldNameValue(catalogue)),
    [previewValues, catalogue],
  );

  const editingEl =
    state.design.elements.find((el): el is TextElement => el.id === state.editingId && el.type === "text") ?? null;
  const editor = useTextEditor({
    element: editingEl,
    pageHeightPx: page.heightPx,
    fieldLabel,
    onChange: (paragraphs) => {
      if (editingEl) dispatch({ type: "update", key: `type-${editingEl.id}`, changes: [{ id: editingEl.id, patch: { paragraphs } }] });
    },
  });

  // Fit-to-width zoom follows the viewport size.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setFitZoom(Math.max(0.05, (entry.contentRect.width - 32) / page.widthPx)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [page.widthPx]);

  // Keyboard: undo/redo/duplicate/delete/nudge; Escape ends typing or clears the selection.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const typing = target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      const mod = e.ctrlKey || e.metaKey;
      if (state.editingId) {
        if (e.key === "Escape") {
          e.preventDefault();
          dispatch({ type: "endEdit" });
        }
        return;
      }
      if (typing) return;
      const key = e.key.toLowerCase();
      if (mod && key === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      } else if (mod && key === "y") {
        e.preventDefault();
        dispatch({ type: "redo" });
      } else if (mod && key === "d") {
        e.preventDefault();
        dispatch({ type: "duplicateSelected", newId: newElementId });
      } else if ((e.key === "Delete" || e.key === "Backspace") && state.selection.length) {
        e.preventDefault();
        dispatch({ type: "deleteSelected" });
      } else if (e.key === "Escape") {
        dispatch({ type: "select", ids: [] });
      } else if (e.key.startsWith("Arrow") && state.selection.length) {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 0.1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        dispatch({
          type: "update",
          key: "nudge",
          changes: state.design.elements
            .filter((el) => state.selection.includes(el.id) && !el.locked)
            .map((el) => {
              const r = clampPct({ x: el.x + dx, y: el.y + dy, w: el.w, h: el.h });
              return { id: el.id, patch: { x: r.x, y: r.y } };
            }),
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.editingId, state.selection, state.design.elements]);

  useEffect(() => {
    if (!state.dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state.dirty]);

  function addText() {
    const id = newElementId();
    dispatch({
      type: "add",
      element: {
        id,
        name: "Text",
        type: "text",
        x: 20,
        y: 45,
        w: 60,
        h: 8,
        locked: false,
        hidden: false,
        align: "center",
        lineHeight: 1.25,
        fit: "wrap",
        paragraphs: [{ runs: [{ kind: "text", text: "Type your text", style: DEFAULT_STYLE }] }],
      },
    });
    dispatch({ type: "startEdit", id });
  }

  function pickField(field: string, transform: FieldTransform, label: string) {
    if (editor && state.editingId) {
      editor.chain().focus().insertContent({ type: FIELD_NODE, attrs: { field, transform } }).run();
      return;
    }
    dispatch({
      type: "add",
      element: {
        id: newElementId(),
        name: label.slice(0, 60),
        type: "text",
        x: 20,
        y: 40,
        w: 60,
        h: 8,
        locked: false,
        hidden: false,
        align: "center",
        lineHeight: 1.2,
        fit: "shrink",
        paragraphs: [{ runs: [{ kind: "field", field, transform, style: { ...DEFAULT_STYLE, sizePct: 5, bold: true } }] }],
      },
    });
  }

  async function onFile(kind: AssetKind, file: File | undefined) {
    if (!file) return;
    if (props.offline) {
      setMessage({ tone: "error", text: "Uploads only work on the real admin page." });
      return;
    }
    setBusy("upload");
    setMessage(null);
    try {
      const { ref, localUrl } = await uploadCertificateAsset(eventId, file, kind);
      setAssetUrls((urls) => ({ ...urls, [assetKey(ref)]: localUrl }));
      if (kind === "template") {
        dispatch({ type: "setTemplate", template: ref });
      } else {
        const w = 20;
        const h = (((w / 100) * page.widthPx * (ref.heightPx / ref.widthPx)) / page.heightPx) * 100;
        dispatch({
          type: "add",
          element: {
            id: newElementId(),
            name: file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Image",
            type: "image",
            x: 40,
            y: 8,
            w,
            h: Math.min(200, Math.max(0.5, h)),
            locked: false,
            hidden: false,
            opacity: 1,
            asset: ref,
          },
        });
      }
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Upload failed." });
    } finally {
      setBusy(null);
    }
  }

  function save() {
    const sent = state.design;
    setMessage(null);
    startSaving(async () => {
      const res = await saveCertificateDesignAction({ eventId, groupId, design: sent });
      if (!res.ok) {
        setMessage({ tone: "error", text: res.error });
        return;
      }
      // Only clear "unsaved" if nothing changed while the save was in flight.
      if (latestDesign.current === sent) dispatch({ type: "markSaved" });
      setMessage({ tone: "ok", text: "Saved." });
    });
  }

  async function previewPdf() {
    const win = window.open("", "_blank");
    setBusy("preview");
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/certificates/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groupId, design: state.design, recipientKey: previewKey || null }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not build the preview.");
      }
      const url = URL.createObjectURL(await res.blob());
      if (win) win.location.href = url;
      else window.location.assign(url);
    } catch (err) {
      win?.close();
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Could not build the preview." });
    } finally {
      setBusy(null);
    }
  }

  async function copyDesign() {
    setConfirmCopy(false);
    setBusy("copy");
    setMessage(null);
    try {
      const res = await copyCertificateDesignAction({ eventId, sourceEventId: copyFrom });
      if (!res.ok) throw new Error(res.error);
      setAssetUrls((urls) => ({ ...urls, ...res.assetUrls }));
      dispatch({ type: "replaceDesign", design: res.design });
      setMessage({ tone: "ok", text: "Design copied. Check it over, then Save." });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Could not copy that design." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="cd">
      <style>{FONT_CSS}</style>
      <p className="note cd-narrow">Open this page on a laptop or desktop to edit the design.</p>

      <div className="cd-wide">
        <div className="cd-toolbar">
          <div className="stack">
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => templateInput.current?.click()}>
              {page.template ? "Replace template" : "Upload template"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addText}>
              + Text
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => imageInput.current?.click()}>
              + Image
            </button>
            <FieldMenu catalogue={catalogue} onPick={pickField} />
          </div>
          <div className="stack">
            <button type="button" className="btn btn-ghost btn-sm" aria-label="Undo" disabled={!state.past.length} onClick={() => dispatch({ type: "undo" })}>
              ↶
            </button>
            <button type="button" className="btn btn-ghost btn-sm" aria-label="Redo" disabled={!state.future.length} onClick={() => dispatch({ type: "redo" })}>
              ↷
            </button>
            <select
              aria-label="Zoom"
              value={String(zoomMode)}
              onChange={(e) => setZoomMode(e.target.value === "fit" ? "fit" : Number(e.target.value))}
            >
              <option value="fit">Fit</option>
              {ZOOMS.map((z) => (
                <option key={z} value={z}>
                  {Math.round(z * 100)}%
                </option>
              ))}
            </select>
          </div>
          <div className="stack">
            <label className="cd-inline">
              Preview as
              <select value={previewKey} onChange={(e) => setPreviewKey(e.target.value)}>
                <option value="">Field names</option>
                {props.previewRecipients.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.name || r.key}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null || props.offline} onClick={previewPdf}>
              {busy === "preview" ? "Building…" : "Preview PDF"}
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={!state.dirty || saving || props.offline} onClick={save}>
              {saving ? "Saving…" : state.dirty ? "Save" : "Saved"}
            </button>
          </div>
        </div>

        <input ref={templateInput} type="file" hidden accept="image/png,image/jpeg,image/svg+xml,image/webp"
          onChange={(e) => { void onFile("template", e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={imageInput} type="file" hidden accept="image/png,image/jpeg,image/svg+xml,image/webp"
          onChange={(e) => { void onFile("image", e.target.files?.[0]); e.target.value = ""; }} />

        {message ? (
          <p className="label" role="status" style={{ color: message.tone === "ok" ? "var(--forest)" : "var(--rust)", marginTop: 8 }}>
            {message.text}
          </p>
        ) : null}
        {busy === "upload" ? <p className="hint">Uploading…</p> : null}
        {!page.template ? (
          <p className="note" style={{ marginTop: 10 }}>
            Start by uploading your base certificate template (PNG or JPEG, up to 8 MB).
          </p>
        ) : null}
        {props.issuedCount > 0 && state.dirty ? (
          <p className="note" style={{ marginTop: 10 }}>
            {props.issuedCount} certificate{props.issuedCount === 1 ? " was" : "s were"} already issued. They keep the design
            they were issued with.
          </p>
        ) : null}

        <div className="cd-layout">
          <LayersPanel state={state} dispatch={dispatch} />
          <div className="cd-viewport" ref={viewport}>
            <Canvas state={state} dispatch={dispatch} zoom={zoom} assetUrls={assetUrls} valueFor={valueFor} editor={editor} />
          </div>
          <PropertiesPanel state={state} dispatch={dispatch} editor={editor} valueFor={valueFor} fieldLabel={fieldLabel} />
        </div>

        {props.designSources.length > 0 ? (
          <details className="cd-copy">
            <summary>Start from another event&rsquo;s design</summary>
            <div className="stack" style={{ marginTop: 10 }}>
              <select value={copyFrom} onChange={(e) => { setCopyFrom(e.target.value); setConfirmCopy(false); }}>
                <option value="">Choose an event…</option>
                {props.designSources.map((s) => (
                  <option key={s.eventId} value={s.eventId}>
                    {s.title} — {s.date}
                  </option>
                ))}
              </select>
              {confirmCopy ? (
                <>
                  <span className="hint">This replaces the design above.</span>
                  <button type="button" className="btn btn-accent btn-sm" disabled={busy !== null} onClick={copyDesign}>
                    Replace
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmCopy(false)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-ghost btn-sm" disabled={!copyFrom || busy !== null || props.offline} onClick={() => setConfirmCopy(true)}>
                  {busy === "copy" ? "Copying…" : "Copy design"}
                </button>
              )}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}
```

`src/components/admin/certificates/DesignerLoader.tsx`:

```tsx
"use client";

import dynamic from "next/dynamic";
import type { CertificateDesignerProps } from "./CertificateDesigner";

// The editor (TipTap, font metrics) is browser-only and heavy: load it on this page, on the client.
const CertificateDesigner = dynamic(() => import("./CertificateDesigner").then((m) => m.CertificateDesigner), {
  ssr: false,
  loading: () => <div className="cal-empty">Loading the certificate designer…</div>,
});

export function DesignerLoader(props: CertificateDesignerProps) {
  return <CertificateDesigner {...props} />;
}
```

- [ ] **Step 5: Styles**

In `src/app/globals.css`, find this block (the end of the `.imged` rules, just before the `@layer components` closing brace):

```css
    .imged-output select { font-size: 16px; }
  }
```

and insert the following directly after it (still inside `@layer components`):

```css
  /* ── certificate designer (/admin/events/[id]/certificates) ──────────────
     The editor needs a laptop-sized screen: below 1024px the Design tab shows
     a note instead (.cd-narrow), the Issue tab stays responsive. */
  .chip[aria-current="page"] {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--paper);
  }
  .cd-narrow { display: none; }
  @media (max-width: 1023px) {
    .cd-narrow { display: block; }
    .cd-wide { display: none; }
  }
  .cd-toolbar {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 10px;
    padding: 10px;
    border: 1px solid var(--line-2);
    border-radius: var(--r-md);
    background: var(--card);
  }
  .cd-toolbar select,
  .cd-panel input:not([type="range"]):not([type="color"]),
  .cd-panel select,
  .cd-copy select {
    padding: 6px 8px;
    border: 1px solid var(--line-3);
    border-radius: 8px;
    background: var(--paper-2);
    color: var(--ink);
    font: 400 12.5px var(--sans);
    min-width: 0;
  }
  .cd-inline { display: inline-flex; align-items: center; gap: 6px; font: 500 12px var(--sans); color: var(--ink-2); }
  .cd-layout {
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr) 270px;
    gap: 12px;
    margin-top: 12px;
    align-items: start;
  }
  .cd-panel {
    display: grid;
    gap: 8px;
    padding: 12px;
    max-height: 80vh;
    overflow: auto;
    border: 1px solid var(--line-2);
    border-radius: var(--r-md);
    background: var(--card);
  }
  .cd-viewport {
    max-height: 80vh;
    overflow: auto;
    padding: 16px;
    border: 1px solid var(--line-2);
    border-radius: var(--r-md);
    background: var(--sand);
  }
  .cd-stage {
    position: relative;
    margin: 0 auto;
    box-shadow: 0 2px 14px rgb(0 0 0 / 0.14);
    touch-action: none;
    user-select: none;
  }
  .cd-svg { display: block; }
  .cd-text {
    white-space: pre;
    font-kerning: none;
    font-feature-settings: "liga" 0, "clig" 0, "calt" 0, "dlig" 0, "kern" 0;
    font-synthesis: none;
  }
  .cd-guide { stroke: #e0457b; stroke-width: 1; }
  .cd-hit { position: absolute; cursor: move; outline: 1px dashed transparent; }
  .cd-hit:hover { outline-color: rgb(63 94 76 / 0.55); }
  .cd-hit.is-selected { outline: 1.5px solid var(--forest); }
  .cd-hit.is-locked { cursor: default; }
  .cd-handle {
    position: absolute;
    width: 10px;
    height: 10px;
    margin: -5px 0 0 -5px;
    background: #fff;
    border: 1.5px solid var(--forest);
    border-radius: 2px;
  }
  .cd-handle-n, .cd-handle-s { cursor: ns-resize; }
  .cd-handle-e, .cd-handle-w { cursor: ew-resize; }
  .cd-handle-ne, .cd-handle-sw { cursor: nesw-resize; }
  .cd-handle-nw, .cd-handle-se { cursor: nwse-resize; }
  .cd-editing {
    position: absolute;
    transform-origin: 0 0;
    outline: 2px solid var(--forest);
    background: rgb(255 255 255 / 0.65);
    cursor: text;
  }
  .cd-editing .ProseMirror {
    outline: none;
    color: #1a1a1a;
    font-family: "cert-playfair", serif;
    font-kerning: none;
    font-feature-settings: "liga" 0, "clig" 0, "calt" 0, "dlig" 0, "kern" 0;
    font-synthesis: none;
    user-select: text;
  }
  .cd-editing .ProseMirror p { margin: 0; min-height: 1em; }
  .cd-chip { background: rgb(63 94 76 / 0.14); border-radius: 0.12em; }
  .cd-row { display: grid; gap: 4px; font: 500 11.5px var(--sans); color: var(--ink-2); }
  .cd-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .cd-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
  .cd-warn { color: var(--rust); }
  .cd-layers { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .cd-layers li { display: flex; align-items: center; gap: 2px; border-radius: 8px; }
  .cd-layers li.is-selected { background: var(--forest-tint); }
  .cd-layer-name {
    flex: 1;
    min-width: 0;
    padding: 6px;
    overflow: hidden;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
    border: 0;
    background: none;
    color: var(--ink);
    font: 400 12.5px var(--sans);
    cursor: pointer;
  }
  .cd-icon { padding: 4px; border: 0; background: none; color: var(--ink-3); font-size: 12px; cursor: pointer; }
  .cd-menu { position: relative; }
  .cd-menu-panel {
    position: absolute;
    z-index: 20;
    top: calc(100% + 6px);
    left: 0;
    display: grid;
    gap: 10px;
    width: 260px;
    max-height: 60vh;
    overflow: auto;
    padding: 10px;
    border: 1px solid var(--line-3);
    border-radius: var(--r-md);
    background: var(--card);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.16);
  }
  .cd-menu-transforms { display: flex; flex-wrap: wrap; gap: 4px; }
  .cd-menu-transforms .chip { padding: 5px 10px; font-size: 11px; }
  .cd-menu-group { display: grid; gap: 2px; }
  .cd-menu-item {
    padding: 6px 8px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--ink);
    font: 400 13px var(--sans);
    text-align: left;
    cursor: pointer;
  }
  .cd-menu-item:hover { background: var(--sand); }
  .cd-copy { margin-top: 14px; }
```

- [ ] **Step 6: Lint and type-check the editor**

```bash
npx eslint src/components/admin/certificates
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "components/admin/certificates" || echo "no errors in editor"
```

Expected: ESLint clean and `no errors in editor`.

If `react-hooks` flags a ref write during render anywhere, move the write into a `useEffect` (see `useTextEditor.ts` for the pattern). If it flags `setGuides` in `Canvas.tsx`, the calls are in pointer handlers and are fine. Only change code for a real rule hit.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/certificates src/app/globals.css
git commit -m "feat(certificates): the designer UI — canvas, in-place rich text, fields, layers, properties

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Swap the page to Design / Issue tabs and remove v1

**Files:**
- Replace: `src/app/admin/(app)/events/[id]/certificates/page.tsx`
- Create: `src/components/admin/certificates/IssuePanel.tsx`
- Delete: `src/components/admin/CertificateManager.tsx`
- Replace: `src/lib/certificates/config.ts`
- Modify: `src/lib/certificates/config.test.ts`, `src/app/admin/(app)/certificates/page.tsx`

**Interfaces:**
- Consumes: `getCertificateWorkspace`, `listDesignSources` (Task 8); `issueCertificatesBatchAction` (Task 9); `DesignerLoader` (Task 11); `RecipientCounts`, `RecipientStatus`, `IssueMode` (Task 8).
- Produces: `IssuePanel({ eventId, rows: IssueRow[], counts, hasTemplate })`; `IssueRow { key; name; email; status }`.

- [ ] **Step 1: The issue panel**

`src/components/admin/certificates/IssuePanel.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { issueCertificatesBatchAction } from "@/app/admin/(app)/events/[id]/certificates/actions";
import type { IssueMode, RecipientCounts, RecipientStatus } from "@/lib/certificates/recipients";

export interface IssueRow {
  key: string;
  name: string;
  email: string | null;
  status: RecipientStatus;
}

interface Progress {
  done: number;
  failed: number;
  skipped: number;
  remaining: number;
}

/**
 * Bulk issuing (spec §5.2): the browser calls one server batch at a time
 * behind a progress bar, so a long run survives the function timeout and can
 * be stopped. Closing the tab only stops it; the next run picks up where it left.
 */
export function IssuePanel({
  eventId,
  rows,
  counts,
  hasTemplate,
}: {
  eventId: string;
  rows: IssueRow[];
  counts: RecipientCounts;
  hasTemplate: boolean;
}) {
  const router = useRouter();
  const [running, setRunning] = useState<IssueMode | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);

  async function run(mode: IssueMode) {
    stop.current = false;
    setRunning(mode);
    setError(null);
    const p: Progress = { done: 0, failed: 0, skipped: 0, remaining: mode === "email" ? counts.pendingEmail : counts.pendingEmail + counts.noEmail };
    setProgress({ ...p });
    try {
      while (!stop.current) {
        const res = await issueCertificatesBatchAction({ eventId, mode });
        if (!res.ok) {
          setError(res.error);
          break;
        }
        p.done += res.sent + res.recorded;
        p.failed += res.failed;
        p.skipped += res.skipped;
        p.remaining = res.remaining;
        setProgress({ ...p });
        if (res.processed === 0 || res.remaining === 0) break;
        if (res.sent + res.recorded + res.skipped === 0) {
          setError("Every certificate in the last batch failed. Check the email settings, then run again.");
          break;
        }
      }
    } catch {
      setError("Lost the connection while issuing. Run again to continue — nobody gets a certificate twice.");
    } finally {
      setRunning(null);
      router.refresh();
    }
  }

  const total = progress ? progress.done + progress.failed + progress.remaining : 0;

  return (
    <section style={{ marginTop: 20 }}>
      <p className="body-text">
        {counts.total} attended · {counts.issued} issued · {counts.pendingEmail} to email
        {counts.noEmail ? ` · ${counts.noEmail} without an email` : ""}
        {counts.revoked ? ` · ${counts.revoked} revoked` : ""}
      </p>

      <div className="stack" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="btn btn-accent btn-sm"
          disabled={running !== null || !hasTemplate || counts.pendingEmail === 0}
          onClick={() => run("email")}
        >
          {running === "email" ? "Sending…" : `Issue & email (${counts.pendingEmail})`}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={running !== null || !hasTemplate || counts.pendingEmail + counts.noEmail === 0}
          onClick={() => run("record")}
        >
          {running === "record" ? "Issuing…" : "Issue only (no email)"}
        </button>
        {running ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => (stop.current = true)}>
            Stop
          </button>
        ) : null}
        {!hasTemplate ? <span className="hint">Add a template in the Design tab first.</span> : null}
      </div>

      {progress ? (
        <div style={{ marginTop: 12, maxWidth: 520 }}>
          <progress value={progress.done + progress.failed} max={Math.max(1, total)} style={{ width: "100%" }} />
          <p className="hint">
            {progress.done} done{progress.failed ? ` · ${progress.failed} failed (retried next run)` : ""}
            {progress.skipped ? ` · ${progress.skipped} already issued` : ""} · {progress.remaining} left
          </p>
        </div>
      ) : null}
      {error ? (
        <p className="label" role="alert" style={{ color: "var(--rust)", marginTop: 8 }}>
          {error}
        </p>
      ) : null}

      {rows.length > 0 ? (
        <div className="tablewrap" style={{ marginTop: 16 }}>
          <table className="admin">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Email</th>
                <th>Certificate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.key}>
                  <td>{i + 1}</td>
                  <td style={{ fontWeight: 500 }}>{r.name || "—"}</td>
                  <td>{r.email ?? <span style={{ color: "var(--rust)" }}>no email</span>}</td>
                  <td>
                    {r.status.state === "issued" ? (
                      <span className="abadge abadge-approved" title={r.status.serial}>
                        Issued
                      </span>
                    ) : r.status.state === "revoked" ? (
                      <span className="abadge abadge-rejected">Revoked</span>
                    ) : (
                      <span className="abadge abadge-pending">Pending</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="cal-empty" style={{ marginTop: 14 }}>
          No attendees yet — mark people present on the registrations page first.
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: The page**

`src/app/admin/(app)/events/[id]/certificates/page.tsx`:

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { getCertificateWorkspace, listDesignSources } from "@/lib/admin/certificates";
import { DesignerLoader } from "@/components/admin/certificates/DesignerLoader";
import { IssuePanel } from "@/components/admin/certificates/IssuePanel";

const CAP = "issue:participation_certificate";
const TABS = [
  { id: "design", label: "Design" },
  { id: "issue", label: "Issue" },
] as const;

export default async function EventCertificatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requireViewPage(CAP);
  const { id } = await params;
  const { tab: requested } = await searchParams;
  const tab = requested === "issue" ? "issue" : "design";

  const ev = await getEventForAttendance(id);
  if (!ev) notFound();
  // An editing surface: read-only viewers (faculty) don't manage certificates.
  if (!canManage(session, CAP, ev.clubId)) redirect("/admin/events");

  const ws = await getCertificateWorkspace(id, session.id);
  if (!ws) notFound();
  const sources = tab === "design" ? await listDesignSources(session, id) : [];

  return (
    <div className="admin-page">
      <Link href={`/admin/events/${id}/registrations`} className="label" style={{ color: "var(--forest)" }}>
        ← Registrations
      </Link>
      <div style={{ marginTop: 14 }}>
        <div className="eyebrow">Certificates</div>
        <h1 style={{ margin: "6px 0 0" }}>{ev.title}</h1>
      </div>

      <nav className="stack" aria-label="Certificate sections" style={{ marginTop: 16 }}>
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/admin/events/${id}/certificates?tab=${t.id}`}
            className="chip"
            aria-current={tab === t.id ? "page" : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "design" ? (
        <div style={{ marginTop: 16 }}>
          <DesignerLoader
            eventId={id}
            groupId={ws.group.id}
            initialDesign={ws.editableDesign}
            initialAssetUrls={ws.assetUrls}
            catalogue={ws.catalogue}
            previewRecipients={ws.recipients.map((r) => ({ key: r.key, name: r.name, values: r.values }))}
            issuedCount={ws.counts.issued}
            designSources={sources}
          />
        </div>
      ) : (
        <IssuePanel
          eventId={id}
          rows={ws.recipients.map((r) => ({ key: r.key, name: r.name, email: r.email, status: r.status }))}
          counts={ws.counts}
          hasTemplate={!!ws.group.design.page.template}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Remove v1 code**

```bash
git rm src/components/admin/CertificateManager.tsx
```

Replace `src/lib/certificates/config.ts` with (drops `computeNamePlacement`, keeps v1 parsing for conversion):

```ts
/**
 * The v1 certificate setup (2026-09-01): one uploaded image plus one name
 * anchor, stored in `events.certificate_config`. Kept only so a v1 setup can be
 * converted into a design (`designFromLegacyConfig` in design.ts).
 *
 * Positions are PERCENTAGES of the template image. The anchor
 * (nameXPct, nameYPct) is the visual centre of the name; `align` says which
 * edge of the text sits on the anchor horizontally.
 */
import { z } from "zod";

export interface CertificateConfig {
  /** Anchor X, 0–100, % of image width. */
  nameXPct: number;
  /** Anchor Y (from the top), 0–100, % of image height. */
  nameYPct: number;
  /** Font height as a % of image height (e.g. 4 = 4%). */
  fontPct: number;
  /** Which edge of the text sits on the anchor. */
  align: "left" | "center" | "right";
  /** Ink colour, #rrggbb. */
  color: string;
}

export const DEFAULT_CERTIFICATE_CONFIG: CertificateConfig = {
  nameXPct: 60,
  nameYPct: 47,
  fontPct: 4,
  align: "center",
  color: "#1a1a1a",
};

const Schema = z.object({
  nameXPct: z.coerce.number().min(0).max(100),
  nameYPct: z.coerce.number().min(0).max(100),
  fontPct: z.coerce.number().min(0.5).max(30),
  align: z.enum(["left", "center", "right"]),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .transform((s) => s.toLowerCase()),
});

/** Parse+clamp a stored/submitted config, falling back to the default on junk. */
export function validateCertificateConfig(raw: unknown): CertificateConfig {
  const parsed = Schema.safeParse(raw);
  return parsed.success ? parsed.data : { ...DEFAULT_CERTIFICATE_CONFIG };
}
```

In `src/lib/certificates/config.test.ts`:
- remove `computeNamePlacement,` and `type CertificateConfig,` from the import list;
- delete the whole `describe("computeNamePlacement", () => { … });` block at the end of the file.

- [ ] **Step 4: Point the hub at the new page**

In `src/app/admin/(app)/certificates/page.tsx`, replace:

```tsx
        Pick an event to upload its certificate template, position the name and email
        every attendee their PDF. Only people marked <strong>present</strong> appear.
```

with:

```tsx
        Pick an event to design its certificate — template, logos, wording and fields —
        then issue every attendee their PDF. Only people marked <strong>present</strong> appear.
```

and replace the button label `Issue` (inside the `<Link … className="btn btn-accent btn-sm">`) with `Open`.

- [ ] **Step 5: Full gate**

```bash
npm run typecheck
npm run lint
npm test
```

Expected:
- typecheck: 0 errors.
- lint: clean.
- test: all suites pass. The count is the previous baseline minus v1's removed tests (3 `computeNamePlacement` + 2 old render tests) plus this plan's new tests.

- [ ] **Step 6: Commit**

```bash
git add -A "src/app/admin/(app)/events/[id]/certificates/page.tsx" src/components/admin/certificates/IssuePanel.tsx src/components/admin/CertificateManager.tsx src/lib/certificates/config.ts src/lib/certificates/config.test.ts "src/app/admin/(app)/certificates/page.tsx"
git commit -m "feat(certificates): Design and Issue tabs replace the v1 positioner

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Dev harness and in-browser verification of the editor

**Files:**
- Create: `src/app/dev/certificate-designer/page.tsx`, `src/components/admin/certificates/DesignerHarness.tsx`

**Interfaces:**
- Consumes: `DesignerLoader` (Task 11), `buildFieldCatalogue` (Task 3), `defaultFormFor`, `assetKey`, `DEFAULT_STYLE` (Task 2).
- Produces: a page at `/dev/certificate-designer` in development only (404 in production). It renders the real editor with sample data and `offline` set, so save, upload and preview are disabled.

- [ ] **Step 1: Add the harness**

`src/app/dev/certificate-designer/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { DesignerHarness } from "@/components/admin/certificates/DesignerHarness";

/**
 * Development-only harness for the certificate designer: the real editor with
 * sample data and no login, so it can be exercised in a browser locally. Saving,
 * uploads and PDF preview are disabled here. 404 in production.
 */
export default function CertificateDesignerHarnessPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="admin-page">
      <div className="eyebrow">Dev harness</div>
      <h1 style={{ margin: "6px 0 16px" }}>Certificate designer</h1>
      <DesignerHarness />
    </div>
  );
}
```

`src/components/admin/certificates/DesignerHarness.tsx`:

```tsx
"use client";

import { DEFAULT_STYLE, assetKey, type AssetRef, type Design } from "@/lib/certificates/design";
import { buildFieldCatalogue } from "@/lib/certificates/fields";
import { defaultFormFor, type FormField } from "@/lib/registration-form/schema";
import { DesignerLoader } from "./DesignerLoader";

// Sample data only — never a real person.
const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const TEMPLATE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="3508" height="2480"><rect width="3508" height="2480" fill="#fbf7ee"/><rect x="90" y="90" width="3328" height="2300" fill="none" stroke="#8c5a2b" stroke-width="24"/><rect x="150" y="150" width="3208" height="2180" fill="none" stroke="#8c5a2b" stroke-width="6"/></svg>`;
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><circle cx="300" cy="300" r="280" fill="#3f5e4c"/><text x="300" y="370" font-size="220" text-anchor="middle" fill="#fff" font-family="sans-serif">CSE</text></svg>`;

const TEMPLATE: AssetRef = {
  bucket: "certificate-assets",
  path: "00000000-0000-4000-8000-000000000000/00000000-0000-4000-8000-000000000001.png",
  type: "png",
  widthPx: 3508,
  heightPx: 2480,
};
const LOGO: AssetRef = {
  bucket: "certificate-assets",
  path: "00000000-0000-4000-8000-000000000000/00000000-0000-4000-8000-000000000002.png",
  type: "png",
  widthPx: 600,
  heightPx: 600,
};

const projectQ: FormField = { id: "project", kind: "short_text", identity: null, label: "Project title", required: false };
const catalogue = buildFieldCatalogue({ formSchema: [...defaultFormFor(), projectQ] });

const design: Design = {
  v: 1,
  page: { template: TEMPLATE, widthPx: 3508, heightPx: 2480 },
  elements: [
    { id: "logo", name: "Club logo", type: "image", x: 45, y: 8, w: 10, h: 14.15, locked: false, hidden: false, opacity: 1, asset: LOGO },
    {
      id: "title",
      name: "Title",
      type: "text",
      x: 10,
      y: 26,
      w: 80,
      h: 8,
      locked: false,
      hidden: false,
      align: "center",
      lineHeight: 1.2,
      fit: "wrap",
      paragraphs: [{ runs: [{ kind: "text", text: "CERTIFICATE OF PARTICIPATION", style: { ...DEFAULT_STYLE, font: "cinzel", bold: true, sizePct: 5, color: "#8c5a2b" } }] }],
    },
    {
      id: "name",
      name: "Name",
      type: "text",
      x: 20,
      y: 40,
      w: 60,
      h: 9,
      locked: false,
      hidden: false,
      align: "center",
      lineHeight: 1.2,
      fit: "shrink",
      paragraphs: [{ runs: [{ kind: "field", field: "person.name", transform: "title", style: { ...DEFAULT_STYLE, font: "greatvibes", sizePct: 8, color: "#22241f" } }] }],
    },
    {
      id: "body",
      name: "Body",
      type: "text",
      x: 15,
      y: 55,
      w: 70,
      h: 10,
      locked: false,
      hidden: false,
      align: "center",
      lineHeight: 1.4,
      fit: "wrap",
      paragraphs: [
        {
          runs: [
            { kind: "text", text: "of the ", style: { ...DEFAULT_STYLE, font: "lora", sizePct: 2.6 } },
            { kind: "field", field: "person.department", transform: "none", style: { ...DEFAULT_STYLE, font: "lora", sizePct: 2.6, bold: true } },
            { kind: "text", text: " department participated in ", style: { ...DEFAULT_STYLE, font: "lora", sizePct: 2.6 } },
            { kind: "field", field: "event.title", transform: "none", style: { ...DEFAULT_STYLE, font: "lora", sizePct: 2.6, italic: true } },
            { kind: "text", text: " held on ", style: { ...DEFAULT_STYLE, font: "lora", sizePct: 2.6 } },
            { kind: "field", field: "event.date", transform: "none", style: { ...DEFAULT_STYLE, font: "lora", sizePct: 2.6 } },
            { kind: "text", text: ".", style: { ...DEFAULT_STYLE, font: "lora", sizePct: 2.6 } },
          ],
        },
      ],
    },
  ],
};

const people = [
  { key: "reg:1", name: "asha r", department: "CSE" },
  { key: "reg:2", name: "VENKATA SATYA SAI KRISHNA PRASAD REDDY", department: "Information Technology" },
].map((p) => ({
  key: p.key,
  name: p.name,
  values: {
    "person.name": p.name,
    "person.department": p.department,
    "event.title": "Hack Night 2026",
    "event.date": "14 September 2026",
    "form.project": "Smart Bins",
  },
}));

export function DesignerHarness() {
  return (
    <DesignerLoader
      eventId="00000000-0000-4000-8000-000000000000"
      groupId="00000000-0000-4000-8000-00000000000a"
      initialDesign={design}
      initialAssetUrls={{ [assetKey(TEMPLATE)]: svgUrl(TEMPLATE_SVG), [assetKey(LOGO)]: svgUrl(LOGO_SVG) }}
      catalogue={catalogue}
      previewRecipients={people}
      issuedCount={0}
      designSources={[]}
      offline
    />
  );
}
```

- [ ] **Step 2: Run the app and open the harness**

Run `npm run dev` (background) and open `http://localhost:3000/dev/certificate-designer` in Chrome (claude-in-chrome tools, or by hand).

- [ ] **Step 3: Walk the editor**

Check each; fix anything that fails before moving on:
1. The template border, green logo, "CERTIFICATE OF PARTICIPATION" (Cinzel), `{Name}` (Great Vibes), and the Lora body paragraph with `{Department}`, `{Event title}`, `{Event date}` all render in their fonts. The console has no errors.
2. **Preview as → "VENKATA SATYA SAI KRISHNA PRASAD REDDY"**: the name title-cases and shrinks to fit its box. The body re-wraps with "Information Technology" in bold.
3. Drag the logo left/right: a pink guide appears at the page centre and it snaps. Alt-drag does not snap. A corner handle keeps the logo square; Shift+corner stretches it.
4. Double-click the body: the TipTap editor opens in place in the same fonts. Type a word, select it, press **B** in Properties: it turns bold. Click away: the SVG shows the same text, bold.
5. While typing, **+ Field → Title Case → Club name** inserts `{Club name}` at the cursor. Outside typing, **+ Field → Roll / VTU no.** adds a new shrink box.
6. Ctrl+Z / Ctrl+Y undo and redo a whole drag in one step. Arrows nudge; Shift+arrows move 1 %. Delete removes the selection. Ctrl+D duplicates.
7. Layers: hide, lock (a locked element can't be dragged) and up/down reorder all work.
8. Zoom Fit/25/50/100 % keeps positions. Below 1024 px wide, the "Open this page on a laptop" note shows instead of the editor.

- [ ] **Step 4: Commit**

```bash
git add src/app/dev/certificate-designer/page.tsx src/components/admin/certificates/DesignerHarness.tsx
git commit -m "chore(certificates): dev-only designer harness for browser checks

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Production build, font tracing check, status doc

**Files:**
- Modify: `docs/STATUS.md`

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: success. The route list includes `/admin/events/[id]/certificates`, `/api/admin/events/[id]/certificates/preview` and `/dev/certificate-designer`.

- [ ] **Step 2: Confirm the fonts are traced into both functions**

```bash
find .next/server/app -name "*.nft.json" -path "*certificates*" | while read f; do echo "$f: $(grep -o 'public/fonts/cert/[a-z-]*\.ttf' "$f" | sort -u | wc -l) fonts"; done
```

Expected: the certificates page and the preview route each list **24 fonts**. If either shows 0, adjust the `outputFileTracingIncludes` keys in `next.config.ts` (for example use the exact route path printed by the build), rebuild, and re-check.

- [ ] **Step 3: Production harness is closed**

Run `npm run start` (background), then `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/dev/certificate-designer`.
Expected: `404`. Stop the server.

- [ ] **Step 4: Record it in STATUS.md**

Add at the top of the shipped-work section of `docs/STATUS.md`:

```markdown
> ### 🟡 BUILT ON `feat/certificate-designer` — Certificate designer, phase 1 (2026-09-14)
> Replaces the v1 one-name positioner on **`/admin/events/[id]/certificates`** with **Design / Issue** tabs.
> **Design:** a full editor — upload the base template, place logos/signatures, type rich text (per-word font,
> size, B/I/U, colour) with inline **fields** (name, roll, department, year, team, event title/date/venue/club,
> custom form answers, serial, issue date), shrink-to-fit names, snap guides, layers, undo, preview-as-attendee,
> watermarked preview PDF, copy a design from another event. **Issue:** batched issue & email / issue-only with a
> progress bar; every certificate stores its design version + field values.
> - **Engine:** one shared layout engine (`src/lib/certificates/layout.ts`) + 8 bundled OFL font families with
>   pdf-lib-exact metrics, so the editor and PDF agree. PDFs are A4-sized, vector text.
> - **Migration APPLIED (additive):** `20260914020000_certificate_designer` — `certificate_groups`,
>   `certificate_design_versions`, `certificate_sheet_rows`, recipient/snapshot columns on `certificates`, the
>   `certificates_one_live_per_recipient` index, 3 RPCs for phase 2, private `certificate-assets` bucket.
> - **v1 setups convert automatically** on first open (template + name box); v1-issued certificates are attached.
> - **Dev harness:** `/dev/certificate-designer` (dev only, 404 in prod) exercises the editor without login.
> - **⚠️ OWED — human walkthrough (needs an admin login + TOTP):** on a test event: Design → upload a template,
>   add a logo, a body paragraph with `{Name}` and `{Event title}` → Save → Preview as yourself → Preview PDF
>   (fields filled, matches the editor) → mark yourself present → Issue → Issue & email → the PDF arrives and
>   matches the preview. Open an event that had a **v1** setup and confirm its name box converted.
> - **Next:** phase 2 (team members, sheet groups, Recipients tab, downloads, re-issue/revoke), phase 3 (QR + /verify).
>   Spec: `docs/superpowers/specs/2026-09-14-certificate-designer-design.md`.
```

- [ ] **Step 5: Commit**

```bash
git add docs/STATUS.md
git commit -m "docs(status): certificate designer phase 1 built; owed walkthrough

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review (done while writing)

- **Spec coverage (phase 1 of §11):**
  - tabs → T12
  - groups table (Participants only) → T7, T8
  - editor with template, image, rich text and fields incl. form answers → T2–T5, T10, T11
  - fonts + metrics + layout → T1, T4
  - signed uploads → T8, T9, T11
  - design versions + snapshots → T8, T9
  - Issue & email + issue-only for registrations → T9, T12
  - preview PDF → T9, T11
  - v1 conversion → T2, T8
  - "Start from another event's design" (§2.4) → T8, T9, T11
  - security: capability + scope, route guard, magic bytes, private bucket → T8, T9
  - error table §9 → T8 (v1 conversion race), T9 (render/send rollback, stale fields)
- **Deliberately not in phase 1:**
  - team-member recipients, sheet groups, Recipients tab with warnings, single/print/ZIP downloads, re-issue/revoke → phase 2
  - QR element, 128-bit serials, `/verify` → phase 3
  - the three RPCs and `certificate_sheet_rows` ship in the migration (spec: "full migration applied once") but have no callers yet
- **Deviation from spec, recorded:** §6.4's magic-byte check runs on save for assets that are *new* relative to the stored design (`verifyNewAssets`), not on every asset every time.
- **Type consistency:** `IssueMode` (T8) is used by T9 and T12. `Recipient.values` is a `FieldValues` map (T3). `valueFor: (field) => string` is the lookup shape across layout, render, canvas and preview. `CertificateWorkspace.editableDesign` feeds the editor, while `group.design` feeds issuing.
