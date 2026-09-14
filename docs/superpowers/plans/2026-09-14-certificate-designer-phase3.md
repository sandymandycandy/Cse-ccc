# Certificate Designer — Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anyone holding a certificate can prove it is real. A QR code printed on it opens a public page that says whether the certificate is valid, was replaced or was revoked.

**Architecture:** Serials become 128 random bits (Crockford base32), which makes them unguessable, so the public page can look one up by serial alone. A new `qr` design element is drawn from one pure module (`qr.ts`), which turns the verify URL into a single path in module units. The editor's SVG and the PDF both draw that same path, the way text already shares `layoutText`. `/verify/[serial]` is a public server page. It reads through the service role, maps the row to a PII-free result in a pure tested function, is rate-limited per IP and pads every response to a fixed minimum duration.

**Tech Stack:** as phases 1–2. `qrcode` (already a dependency, `QRCode.create` for the module matrix), `pdf-lib` `drawSvgPath`.

**Spec:** `docs/superpowers/specs/2026-09-14-certificate-designer-design.md`, sections §2.2 (QR element), §6.5 (QR render), §7 (verification), §8 (security) and §11 (phase 3 scope). Also `docs/SECURITY_SPEC.md` §9.

**Phases 1 and 2 are on this branch** (`feat/certificate-designer`). **No migration**: `certificates.serial` is `text unique` and already holds any length.

## Global Constraints

Everything from phases 1–2 still holds. In addition:

- New serials: **128 random bits** from `crypto.randomBytes`, Crockford base32, formatted `CSE-<IST year>-XXXXX-XXXXX-XXXXX-XXXXX-XXXXXX` (26 symbols). **v1 serials (`CSE-2026-9F3AC1B2`) stay valid.**
- `hmac` is still written with `certificateHmac`. Verification does **not** read it.
- QR: `QRCode.create(url, { errorCorrectionLevel: "M" })`, a **4-module quiet zone inside the element box**, vector only. Encodes `${NEXT_PUBLIC_SITE_URL}/verify/<serial>`. Props: colour.
- `/verify/[serial]`: public, `robots: noindex`, **20 requests/min per IP**, timing-uniform (same service-role query for hit and miss, plus a fixed minimum response time).
- The verify page shows **only**:
  - Valid: name · event title · club · event date · group label · issue date (+ the serial itself).
  - Superseded: "Replaced by a newer certificate" · event · issue date. No name.
  - Revoked: "Revoked" · event · revoked date. No name, no reason.
  - Unknown: "Not a valid certificate".
- **Never** email, roll, phone, team members or the revoke reason. Do not even select them.
- A lookup box on `/verify` leads to the same `/verify/<serial>` page.

## File map

| File | Responsibility | Task |
| --- | --- | --- |
| `src/lib/certificates/serial.ts` | 128-bit serial, Crockford encoding, `normalizeSerial` for typed input | 1 |
| `src/lib/certificates/qr.ts` | Pure: verify URL, module matrix, merged runs → one SVG path, square-in-box, printed mm | 2 |
| `src/lib/certificates/design.ts` | `QrElement` in the union and the schema | 2 |
| `src/lib/certificates/render.ts` | Draw QR elements (`drawSvgPath`), origin injected or from `siteOrigin()` | 3 |
| `src/components/admin/certificates/QrSvg.tsx` | Editor drawing of a QR element | 3 |
| `src/lib/certificates/qr-fidelity.test.tsx` | Editor SVG and PDF place the QR identically | 3 |
| `src/components/admin/certificates/{CertificateDesigner,Canvas,PropertiesPanel,LayersPanel,DesignerHarness}.tsx` | `+ QR` button, drawing, aspect-locked resize, properties, harness sample | 4 |
| `src/lib/certificates/verification.ts` | Pure: row → `VerifyResult`, `atLeast` minimum-duration helper | 5 |
| `src/lib/certificates/verify-lookup.ts` | Server: service-role lookup by serial | 5 |
| `src/lib/rate-limit.ts` | `checkVerifyLimits(ip)` | 5 |
| `src/app/verify/page.tsx`, `src/app/verify/[serial]/page.tsx`, `src/components/verify/VerifyLookupForm.tsx` | Public pages | 5 |
| `docs/STATUS.md`, `docs/SECURITY_SPEC.md` | Phase 3 entry, serial format line | 6 |

---

### Task 1: 128-bit serials

**Files:**
- Modify: `src/lib/certificates/serial.ts`
- Create: `src/lib/certificates/serial.test.ts`

**Interfaces:**
- Produces: `newCertificateSerial(random?: (n: number) => Uint8Array, now?: Date): string` (callers in `certificate-issue.ts` keep calling it with no arguments) · `encodeCrockford(bytes: Uint8Array): string` (16 bytes → 26 symbols) · `normalizeSerial(input: string): string | null` · `SERIAL_RE: RegExp` (new format) · `certificateHmac` unchanged.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { encodeCrockford, newCertificateSerial, normalizeSerial, SERIAL_RE } from "./serial";

describe("encodeCrockford", () => {
  it("encodes 128 bits as 26 symbols, most significant first", () => {
    expect(encodeCrockford(new Uint8Array(16))).toBe("0".repeat(26));
    // 130 bits of room, top two always zero → the first symbol is at most 7.
    expect(encodeCrockford(new Uint8Array(16).fill(0xff))).toBe("7" + "Z".repeat(25));
    const one = new Uint8Array(16);
    one[15] = 1;
    expect(encodeCrockford(one)).toBe("0".repeat(25) + "1");
  });
});

describe("newCertificateSerial", () => {
  it("is CSE-<IST year>- then 26 symbols grouped 5-5-5-5-6", () => {
    const s = newCertificateSerial();
    expect(s).toMatch(SERIAL_RE);
    expect(s.replace(/^CSE-\d{4}-/, "").replace(/-/g, "")).toHaveLength(26);
  });

  it("takes the year in IST, not UTC", () => {
    // 31 Dec 2025 19:00 UTC is already 1 Jan 2026 in India.
    expect(newCertificateSerial(undefined, new Date("2025-12-31T19:00:00Z"))).toMatch(/^CSE-2026-/);
  });

  it("uses all 16 random bytes", () => {
    const fixed = (n: number) => new Uint8Array(n).fill(0xff);
    expect(newCertificateSerial(fixed, new Date("2026-09-14T00:00:00Z"))).toBe("CSE-2026-7ZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZZ");
  });

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 2000 }, () => newCertificateSerial()));
    expect(seen.size).toBe(2000);
  });
});

describe("normalizeSerial", () => {
  const canonical = "CSE-2026-7ZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ0";

  it("accepts the canonical form unchanged", () => {
    expect(normalizeSerial(canonical)).toBe(canonical);
  });

  it("forgives case, spaces, missing dashes and look-alike letters", () => {
    expect(normalizeSerial("  cse-2026-7zzzz zzzzz-zzzzz-zzzzz-zzzzzO ")).toBe(canonical);
    expect(normalizeSerial("CSE2026 7ZZZZZZZZZZZZZZZZZZZZZZZZO")).toBe(canonical);
    expect(normalizeSerial("CSE-2026-I0000-L0000-00000-00000-000000")).toBe("CSE-2026-10000-10000-00000-00000-000000");
  });

  it("keeps v1 serials (8 hex digits) valid", () => {
    expect(normalizeSerial("cse-2026-9f3ac1b2")).toBe("CSE-2026-9F3AC1B2");
  });

  it("rejects anything else", () => {
    for (const bad of ["", "CSE-PREVIEW", "CSE-2026-12345", "CSE-2026-U0000-00000-00000-00000-000000", "x".repeat(200), "../admin"]) {
      expect(normalizeSerial(bad)).toBeNull();
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/certificates/serial.test.ts`
Expected: FAIL (`encodeCrockford` / `normalizeSerial` / `SERIAL_RE` not exported).

- [ ] **Step 3: Implement**

Replace `src/lib/certificates/serial.ts`:

```ts
import "server-only";
import { createHmac, randomBytes } from "node:crypto";

/** Crockford base32: no I, L, O or U, so a serial read aloud or retyped survives. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const SYMBOLS = 26; // 128 bits need 26 × 5 = 130 bits of room

/** A new-format serial: CSE-2026-XXXXX-XXXXX-XXXXX-XXXXX-XXXXXX. */
export const SERIAL_RE = /^CSE-\d{4}-[0-9A-HJKMNP-TV-Z]{5}(?:-[0-9A-HJKMNP-TV-Z]{5}){3}-[0-9A-HJKMNP-TV-Z]{6}$/;
/** Phase-1 and earlier serials: CSE-2026-9F3AC1B2 (32 bits). Still valid forever. */
const LEGACY_BODY = /^[0-9A-F]{8}$/;

/** 16 bytes → 26 Crockford symbols, most significant first. */
export function encodeCrockford(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = "";
  for (let i = 0; i < SYMBOLS; i++) {
    out = ALPHABET[Number(n & 31n)] + out;
    n >>= 5n;
  }
  return out;
}

const group = (body: string) =>
  [body.slice(0, 5), body.slice(5, 10), body.slice(10, 15), body.slice(15, 20), body.slice(20)].join("-");

function istYear(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric" }).format(now);
}

/**
 * A certificate serial carrying 128 random bits (SECURITY_SPEC §9). That is
 * what lets `/verify/<serial>` answer to anyone who has the serial: it cannot
 * be guessed or enumerated. `certificates.serial` is UNIQUE; the caller retries
 * on the (astronomically rare) clash.
 */
export function newCertificateSerial(
  random: (n: number) => Uint8Array = (n) => randomBytes(n),
  now: Date = new Date(),
): string {
  return `CSE-${istYear(now)}-${group(encodeCrockford(random(16)))}`;
}

/**
 * Turn what someone typed into the serial as stored, or null if it cannot be
 * one. Forgives case, spaces, missing dashes and Crockford's look-alikes
 * (O→0, I/L→1). Both the new format and v1's 8-hex-digit serials are accepted.
 */
export function normalizeSerial(input: string): string | null {
  if (input.length > 80) return null;
  const compact = input.toUpperCase().replace(/[\s-]+/g, "");
  const m = /^CSE(\d{4})([0-9A-Z]+)$/.exec(compact);
  if (!m) return null;
  const body = m[2].replace(/O/g, "0").replace(/[IL]/g, "1");
  if (LEGACY_BODY.test(body)) return `CSE-${m[1]}-${body}`;
  if (body.length !== SYMBOLS || /[^0-9A-HJKMNP-TV-Z]/.test(body)) return null;
  return `CSE-${m[1]}-${group(body)}`;
}

/** Tamper-evident stamp over the serial (domain-separated), stored in
 *  `certificates.hmac`. Verification does not depend on it (spec §7). */
export function certificateHmac(serial: string): string {
  const secret = process.env.NEXTAUTH_SECRET ?? "";
  return createHmac("sha256", secret).update(`cert:v1|${serial}`).digest("hex");
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/certificates/serial.test.ts`
Expected: PASS. If the "look-alike" case fails, check the expected string: `…zzzzzO` must become `…ZZZZZ0`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/certificates/serial.ts src/lib/certificates/serial.test.ts
git commit -m "feat(certificates): 128-bit Crockford serials and forgiving serial lookup"
```

---

### Task 2: QR geometry and the `qr` design element

**Files:**
- Create: `src/lib/certificates/qr.ts`, `src/lib/certificates/qr.test.ts`
- Modify: `src/lib/certificates/design.ts`, `src/lib/certificates/design.test.ts`

**Interfaces:**
- Produces (`qr.ts`, pure, no `server-only`, safe in the browser):
  - `SAMPLE_SERIAL = "CSE-2026-00000-00000-00000-00000-000000"`
  - `QUIET_ZONE = 4` · `MIN_QR_MM = 20`
  - `verifyUrl(origin: string, serial: string): string`
  - `qrMatrix(text: string): { size: number; dark(row: number, col: number): boolean }`
  - `qrRuns(matrix, quiet = QUIET_ZONE): { x: number; y: number; w: number }[]` (module units, quiet zone included in the offset)
  - `qrPath(runs): string` (one SVG path, y down)
  - `qrSpan(matrix, quiet = QUIET_ZONE): number` (= `size + 2·quiet`)
  - `qrSquare(box: { x; y; w; h }): { x: number; y: number; side: number }` (largest centred square)
  - `qrPrintedMm(sidePx: number, page: { widthPx: number; heightPx: number }): number` (long edge = A4's 297 mm)
- Produces (`design.ts`): `QrElement` (`type: "qr"; color: Hex`), `DesignElement = ImageElement | TextElement | QrElement`.

- [ ] **Step 1: Write the failing tests**

`src/lib/certificates/qr.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import QRCode from "qrcode";
import { qrMatrix, qrPath, qrPrintedMm, qrRuns, qrSpan, qrSquare, QUIET_ZONE, SAMPLE_SERIAL, verifyUrl } from "./qr";

const URL_ = verifyUrl("https://cse-ccc.vercel.app", SAMPLE_SERIAL);

describe("verifyUrl", () => {
  it("joins origin and serial without a double slash", () => {
    expect(verifyUrl("https://x.test/", "CSE-2026-9F3AC1B2")).toBe("https://x.test/verify/CSE-2026-9F3AC1B2");
  });
});

describe("qrMatrix", () => {
  it("is the M-level symbol qrcode builds", () => {
    const ref = QRCode.create(URL_, { errorCorrectionLevel: "M" }).modules;
    const m = qrMatrix(URL_);
    expect(m.size).toBe(ref.size);
    for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) expect(m.dark(r, c)).toBe(Boolean(ref.get(r, c)));
  });
});

describe("qrRuns", () => {
  it("merges each row's dark modules into runs that rebuild the matrix exactly", () => {
    const m = qrMatrix(URL_);
    const runs = qrRuns(m);
    const rebuilt = Array.from({ length: m.size }, () => new Array<boolean>(m.size).fill(false));
    for (const run of runs) {
      expect(run.w).toBeGreaterThan(0);
      for (let i = 0; i < run.w; i++) {
        const row = run.y - QUIET_ZONE;
        const col = run.x - QUIET_ZONE + i;
        expect(rebuilt[row][col]).toBe(false); // runs never overlap
        rebuilt[row][col] = true;
      }
    }
    for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) expect(rebuilt[r][c]).toBe(m.dark(r, c));
  });

  it("never lets two runs in a row touch (they would have been one)", () => {
    const runs = qrRuns(qrMatrix(URL_));
    for (let i = 1; i < runs.length; i++) {
      if (runs[i].y === runs[i - 1].y) expect(runs[i].x).toBeGreaterThan(runs[i - 1].x + runs[i - 1].w);
    }
  });
});

describe("qrPath", () => {
  it("draws one closed rectangle per run", () => {
    expect(qrPath([{ x: 4, y: 5, w: 3 }, { x: 9, y: 5, w: 1 }])).toBe("M4 5h3v1h-3zM9 5h1v1h-1z");
  });
});

describe("qrSquare and sizes", () => {
  it("centres the largest square in the box", () => {
    expect(qrSquare({ x: 10, y: 20, w: 100, h: 60 })).toEqual({ x: 30, y: 20, side: 60 });
    expect(qrSquare({ x: 0, y: 0, w: 50, h: 80 })).toEqual({ x: 0, y: 15, side: 50 });
  });

  it("counts the quiet zone on both sides", () => {
    const m = qrMatrix(URL_);
    expect(qrSpan(m)).toBe(m.size + 2 * QUIET_ZONE);
  });

  it("converts page pixels to printed millimetres on an A4 long edge", () => {
    expect(qrPrintedMm(3508, { widthPx: 3508, heightPx: 2480 })).toBeCloseTo(297, 6);
    expect(qrPrintedMm(421, { widthPx: 3508, heightPx: 2480 })).toBeCloseTo(35.64, 1);
  });
});
```

Add to `src/lib/certificates/design.test.ts`, inside the existing `validateDesign` describe (or a new one):

```ts
describe("qr elements", () => {
  const qr = { id: "qr1", name: "Verification QR", type: "qr", x: 82, y: 70, w: 12, h: 17, locked: false, hidden: false, color: "#1A1A1A" };

  it("accepts a qr element and lowercases its colour", () => {
    const res = validateDesign({ ...emptyDesign(), elements: [qr] }, ctx);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.design.elements[0]).toMatchObject({ type: "qr", color: "#1a1a1a" });
  });

  it("rejects a bad colour", () => {
    expect(validateDesign({ ...emptyDesign(), elements: [{ ...qr, color: "red" }] }, ctx).ok).toBe(false);
  });

  it("carries no asset", () => {
    expect(assetRefsOf({ ...emptyDesign(), elements: [qr] } as Design)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/certificates/qr.test.ts src/lib/certificates/design.test.ts`
Expected: FAIL (module `./qr` missing; qr element rejected by the schema).

- [ ] **Step 3: Implement `qr.ts`**

```ts
import QRCode from "qrcode";

/**
 * The verification QR (spec §2.2, §6.5), as pure geometry shared by the editor
 * and the PDF renderer. The symbol becomes horizontal runs of dark modules and
 * then ONE path in module units. Both sides draw that path under a transform,
 * so the editor shows exactly what gets printed.
 */

/** Same shape and length as a real serial, so the editor's QR has real density. */
export const SAMPLE_SERIAL = "CSE-2026-00000-00000-00000-00000-000000";
/** Blank modules around the symbol, inside the element box (scanners need them). */
export const QUIET_ZONE = 4;
/** Below this printed size phone cameras start to struggle. */
export const MIN_QR_MM = 20;
const A4_LONG_EDGE_MM = 297;

export function verifyUrl(origin: string, serial: string): string {
  return `${origin.replace(/\/+$/, "")}/verify/${encodeURIComponent(serial)}`;
}

export interface QrMatrix {
  size: number;
  dark: (row: number, col: number) => boolean;
}

export function qrMatrix(text: string): QrMatrix {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  return { size: modules.size, dark: (row, col) => modules.get(row, col) === 1 };
}

export interface QrRun {
  x: number;
  y: number;
  w: number;
}

export function qrRuns(matrix: QrMatrix, quiet = QUIET_ZONE): QrRun[] {
  const runs: QrRun[] = [];
  for (let row = 0; row < matrix.size; row++) {
    let start = -1;
    for (let col = 0; col <= matrix.size; col++) {
      const dark = col < matrix.size && matrix.dark(row, col);
      if (dark && start < 0) start = col;
      if (!dark && start >= 0) {
        runs.push({ x: start + quiet, y: row + quiet, w: col - start });
        start = -1;
      }
    }
  }
  return runs;
}

export function qrPath(runs: QrRun[]): string {
  return runs.map((r) => `M${r.x} ${r.y}h${r.w}v1h-${r.w}z`).join("");
}

export const qrSpan = (matrix: QrMatrix, quiet = QUIET_ZONE): number => matrix.size + 2 * quiet;

export function qrSquare(box: { x: number; y: number; w: number; h: number }): { x: number; y: number; side: number } {
  const side = Math.min(box.w, box.h);
  return { x: box.x + (box.w - side) / 2, y: box.y + (box.h - side) / 2, side };
}

export function qrPrintedMm(sidePx: number, page: { widthPx: number; heightPx: number }): number {
  return (sidePx / Math.max(page.widthPx, page.heightPx)) * A4_LONG_EDGE_MM;
}
```

- [ ] **Step 4: Add `QrElement` to `design.ts`**

After `TextElement`:

```ts
/** The verification QR. Always drawn square, centred in its box (spec §2.2). */
export interface QrElement extends ElementBase {
  type: "qr";
  color: Hex;
}

export type DesignElement = ImageElement | TextElement | QrElement;
```

In the `element` discriminated union, add a third branch:

```ts
  z.object({ ...base, type: z.literal("qr"), color: hex }),
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx vitest run src/lib/certificates/qr.test.ts src/lib/certificates/design.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: errors in the editor files and `render.ts` wherever the union is narrowed by `type === "image"` then assumed text (`PropertiesPanel.tsx` `<TextProperties el={el}>`, `Canvas.tsx` render loop, `render.ts` text branch). Those are Tasks 3–4. Nothing else should fail.

- [ ] **Step 6: Commit** (with the next task if typecheck is red; the gate is per phase, but keep each commit's tests green)

```bash
git add src/lib/certificates/qr.ts src/lib/certificates/qr.test.ts src/lib/certificates/design.ts src/lib/certificates/design.test.ts
git commit -m "feat(certificates): QR geometry and the qr design element"
```

---

### Task 3: Draw the QR in the PDF and in the editor, identically

**Files:**
- Modify: `src/lib/certificates/render.ts`
- Create: `src/components/admin/certificates/QrSvg.tsx`, `src/lib/certificates/qr-fidelity.test.tsx`
- Modify: `src/lib/certificates/render.test.ts`

**Interfaces:**
- Consumes: `qr.ts` from Task 2; `siteOrigin()` from `src/lib/site-origin.ts`.
- Produces: `RenderInput.verifyOrigin?: string` (defaults to `siteOrigin()`). `renderCertificatesPdf` throws `"NEXT_PUBLIC_SITE_URL is not set — the verification QR would point nowhere."` when a visible QR has a serial and no origin is available. A QR whose `cert.serial` value is empty draws nothing.
- Produces: `<QrSvg box={{x,y,w,h}} color text />` draws inside the editor's page-px SVG.

- [ ] **Step 1: Write the failing fidelity test**

`src/lib/certificates/qr-fidelity.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { inflateSync } from "node:zlib";
import { renderToStaticMarkup } from "react-dom/server";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { emptyDesign, type Design, type QrElement } from "./design";
import { PAGE_LONG_EDGE_PT, renderCertificatesPdf } from "./render";
import { qrMatrix, qrPath, qrRuns, qrSpan, qrSquare, verifyUrl } from "./qr";
import { QrSvg } from "@/components/admin/certificates/QrSvg";

const ORIGIN = "https://cse-ccc.vercel.app";
const SERIAL = "CSE-2026-7ZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ0";
const qr: QrElement = { id: "qr", name: "QR", type: "qr", x: 80, y: 66, w: 14, h: 22, locked: false, hidden: false, color: "#224466" };
const design: Design = { ...emptyDesign(), elements: [qr] };
const box = {
  x: (qr.x / 100) * design.page.widthPx,
  y: (qr.y / 100) * design.page.heightPx,
  w: (qr.w / 100) * design.page.widthPx,
  h: (qr.h / 100) * design.page.heightPx,
};
const url = verifyUrl(ORIGIN, SERIAL);
const matrix = qrMatrix(url);
const square = qrSquare(box);
const module = square.side / qrSpan(matrix);

async function pageContent(bytes: Uint8Array): Promise<string> {
  const pdf = await PDFDocument.load(bytes);
  let content = "";
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const raw = Buffer.from(obj.getContents());
    const decoded = String(obj.dict.get(PDFName.of("Filter"))) === "/FlateDecode" ? inflateSync(raw) : raw;
    const text = decoded.toString("latin1");
    if (text.includes(" cm")) content += text;
  }
  return content;
}

describe("verification QR: editor and PDF agree", () => {
  it("the editor draws the shared path, scaled to one module and offset to the centred square", () => {
    const svg = renderToStaticMarkup(
      <svg>
        <QrSvg box={box} color={qr.color} text={url} />
      </svg>,
    );
    const g = /<g transform="translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)"/.exec(svg);
    expect(g, svg.slice(0, 200)).not.toBeNull();
    expect(Number(g![1])).toBeCloseTo(square.x, 6);
    expect(Number(g![2])).toBeCloseTo(square.y, 6);
    expect(Number(g![3])).toBeCloseTo(module, 6);
    expect(svg).toContain(`d="${qrPath(qrRuns(matrix))}"`);
    expect(svg).toContain('fill="#224466"');
  });

  it("the PDF applies the same placement in points, with the y axis flipped", async () => {
    const bytes = await renderCertificatesPdf({
      design,
      pages: [{ valueFor: (k) => (k === "cert.serial" ? SERIAL : "") }],
      loadAsset: async () => new Uint8Array(),
      loadFont: async () => new Uint8Array(),
      verifyOrigin: ORIGIN,
    });
    const k = PAGE_LONG_EDGE_PT / Math.max(design.page.widthPx, design.page.heightPx);
    const pageH = design.page.heightPx * k;
    const content = await pageContent(bytes);

    const translate = /1 0 0 1 ([\d.-]+) ([\d.-]+) cm/.exec(content);
    const scale = /([\d.]+) 0 0 -([\d.]+) 0 0 cm/.exec(content);
    expect(translate, content.slice(0, 300)).not.toBeNull();
    expect(scale).not.toBeNull();
    expect(Number(translate![1])).toBeCloseTo(square.x * k, 3);
    expect(Number(translate![2])).toBeCloseTo(pageH - square.y * k, 3);
    expect(Number(scale![1])).toBeCloseTo(module * k, 4);
    // one moveto per run
    expect((content.match(/ m\n/g) ?? []).length).toBe(qrRuns(matrix).length);
  });
});
```

(The regexes assume pdf-lib's operator spelling: `a b c d e f cm`, `x y m` on its own line. If the first run shows a different spelling, print `content.slice(0, 600)` and adjust the regex, **not** the placement maths.)

Add to `render.test.ts`:

```ts
  it("draws nothing for a QR without a serial, and refuses a QR with nowhere to point", async () => {
    const d = emptyDesign();
    d.elements = [{ id: "qr", name: "QR", type: "qr", x: 80, y: 70, w: 12, h: 17, locked: false, hidden: false, color: "#000000" }];
    const base = { design: d, loadAsset: async () => PNG, loadFont };
    await expect(renderCertificatesPdf({ ...base, pages: [{ valueFor: () => "" }], verifyOrigin: "" })).resolves.toBeInstanceOf(Uint8Array);
    await expect(
      renderCertificatesPdf({ ...base, pages: [{ valueFor: (k) => (k === "cert.serial" ? "CSE-2026-9F3AC1B2" : "") }], verifyOrigin: "" }),
    ).rejects.toThrow(/NEXT_PUBLIC_SITE_URL/);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/certificates/qr-fidelity.test.tsx src/lib/certificates/render.test.ts`
Expected: FAIL (`QrSvg` missing; `verifyOrigin` unknown; the QR is not drawn).

- [ ] **Step 3: Implement `QrSvg.tsx`**

```tsx
import { qrMatrix, qrPath, qrRuns, qrSpan, qrSquare } from "@/lib/certificates/qr";

/**
 * The verification QR in the editor's page-sized SVG: the same path the PDF
 * draws, under the same placement (largest centred square, one unit = one module).
 */
export function QrSvg({ box, color, text }: { box: { x: number; y: number; w: number; h: number }; color: string; text: string }) {
  const matrix = qrMatrix(text);
  const square = qrSquare(box);
  const module = square.side / qrSpan(matrix);
  return (
    <g transform={`translate(${square.x} ${square.y}) scale(${module})`}>
      <path d={qrPath(qrRuns(matrix))} fill={color} shapeRendering="crispEdges" />
    </g>
  );
}
```

- [ ] **Step 4: Draw QR elements in `render.ts`**

Imports: `import { qrMatrix, qrPath, qrRuns, qrSpan, qrSquare, verifyUrl } from "./qr";` and `import { siteOrigin } from "@/lib/site-origin";`.

`RenderInput` gains:

```ts
  /** Origin the QR points at. Defaults to NEXT_PUBLIC_SITE_URL; tests pass their own. */
  verifyOrigin?: string;
```

Before the page loop:

```ts
  const origin = input.verifyOrigin ?? siteOrigin() ?? "";
```

Inside the element loop, after the image branch and before the text layout:

```ts
      if (el.type === "qr") {
        const serial = valueFor("cert.serial");
        if (!serial) continue;
        if (!origin) throw new Error("NEXT_PUBLIC_SITE_URL is not set — the verification QR would point nowhere.");
        const matrix = qrMatrix(verifyUrl(origin, serial));
        const square = qrSquare({ x: (el.x / 100) * W, y: (el.y / 100) * H, w: (el.w / 100) * W, h: (el.h / 100) * H });
        page.drawSvgPath(qrPath(qrRuns(matrix)), {
          x: square.x * k,
          y: pageH - square.y * k,
          scale: (square.side / qrSpan(matrix)) * k,
          color: rgbHex(el.color),
        });
        continue;
      }
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/certificates/qr-fidelity.test.tsx src/lib/certificates/render.test.ts src/lib/certificates/layout-fidelity.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/certificates/render.ts src/lib/certificates/render.test.ts src/lib/certificates/qr-fidelity.test.tsx src/components/admin/certificates/QrSvg.tsx
git commit -m "feat(certificates): draw the verification QR in the PDF and the editor from one path"
```

---

### Task 4: QR in the editor

**Files:**
- Modify: `src/components/admin/certificates/CertificateDesigner.tsx`, `Canvas.tsx`, `PropertiesPanel.tsx`, `LayersPanel.tsx`, `DesignerHarness.tsx`

**Interfaces:**
- Consumes: `QrSvg`, `SAMPLE_SERIAL`, `verifyUrl`, `qrPrintedMm`, `qrSquare`, `MIN_QR_MM`, `QrElement`.

- [ ] **Step 1: `+ QR` in the toolbar** (`CertificateDesigner.tsx`)

Next to `addText`:

```ts
  function addQr() {
    // Square on the page: the same pixel width and height, expressed as % of each side.
    const w = 12;
    const h = Math.min(200, ((w / 100) * page.widthPx * 100) / page.heightPx);
    dispatch({
      type: "add",
      element: { id: newElementId(), name: "Verification QR", type: "qr", x: 100 - w - 6, y: Math.max(0, 100 - h - 8), w, h, locked: false, hidden: false, color: "#1a1a1a" },
    });
  }
```

After the `+ Image` button: `<button type="button" className="btn btn-ghost btn-sm" onClick={addQr}>+ QR</button>`.

- [ ] **Step 2: Draw and resize it** (`Canvas.tsx`)

At module level:

```ts
import { SAMPLE_SERIAL, verifyUrl } from "@/lib/certificates/qr";
import { QrSvg } from "./QrSvg";

/** What the QR encodes on a real certificate, with a placeholder serial of the real length. */
const SAMPLE_QR_TEXT = verifyUrl(process.env.NEXT_PUBLIC_SITE_URL ?? "", SAMPLE_SERIAL);
```

In the SVG element loop, before the text lookup:

```tsx
          if (el.type === "qr") {
            return <QrSvg key={el.id} box={pctToPx(el, page)} color={el.color} text={SAMPLE_QR_TEXT} />;
          }
```

In `onPointerMove` resize: `const keepAspect = el.type === "qr" || (el.type === "image" && !e.shiftKey);`

- [ ] **Step 3: Properties** (`PropertiesPanel.tsx`)

Label: `{el.type === "image" ? "Image" : el.type === "qr" ? "Verification QR" : "Text"}`.

Replace the `image ? … : <TextProperties …>` ternary with three branches. The QR branch:

```tsx
      ) : el.type === "qr" ? (
        <QrProperties el={el} page={state.design.page} set={set} />
      ) : (
```

and add:

```tsx
function QrProperties({
  el,
  page,
  set,
}: {
  el: QrElement;
  page: { widthPx: number; heightPx: number };
  set: (patch: Partial<DesignElement>, key: string) => void;
}) {
  const box = pctToPx(el, page);
  const mm = qrPrintedMm(qrSquare(box).side, page);
  return (
    <>
      <label className="cd-row">
        <span>Colour</span>
        <input type="color" value={el.color} onChange={(e) => set({ color: e.target.value.toLowerCase() }, "color")} />
      </label>
      <p className="hint">
        Each certificate gets its own code, linking to its public check page. Keep it dark on a light background.
      </p>
      <p className={`hint${mm < MIN_QR_MM ? " cd-warn" : ""}`}>
        About {Math.round(mm)} mm across when printed on A4{mm < MIN_QR_MM ? " — too small for most phone cameras. Make it bigger." : "."}
      </p>
    </>
  );
}
```

(`pctToPx` from `./geometry`; `qrPrintedMm`, `qrSquare`, `MIN_QR_MM` from `@/lib/certificates/qr`; `QrElement` from design.)

- [ ] **Step 4: Layers icon** (`LayersPanel.tsx`)

`{el.type === "image" ? "▣" : el.type === "qr" ? "▦" : "T"}`

- [ ] **Step 5: Harness sample** (`DesignerHarness.tsx`)

Append to the sample design's `elements`:

```ts
    { id: "qr", name: "Verification QR", type: "qr", x: 82, y: 70, w: 10, h: 14.15, locked: false, hidden: false, color: "#1a1a1a" },
```

- [ ] **Step 6: Typecheck, lint, tests**

Run: `npm run typecheck && npm run lint && npx vitest run src/components/admin/certificates src/lib/certificates`
Expected: all green.

- [ ] **Step 7: Browser check through the dev harness**

`npm run dev`, open `/dev/certificate-designer`:
1. The sample QR renders bottom-right and looks like a QR.
2. Drag it and resize it from a corner. It stays square.
3. The properties panel shows the colour and "About N mm". Shrink it below 20 mm and the warning appears.
4. `+ QR` adds another. Undo removes it.
5. Change the colour and the canvas follows.

Take a screenshot of the QR on the canvas and decode it. If a decoder is at hand, confirm it reads `…/verify/CSE-2026-00000-…`. Otherwise record that the scan is owed to the human walkthrough.

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/certificates
git commit -m "feat(certificates): + QR in the designer — square resize, colour, printed-size warning"
```

---

### Task 5: Public verification

**Files:**
- Create: `src/lib/certificates/verification.ts`, `src/lib/certificates/verification.test.ts`, `src/lib/certificates/verify-lookup.ts`, `src/components/verify/VerifyLookupForm.tsx`, `src/app/verify/page.tsx`, `src/app/verify/[serial]/page.tsx`
- Modify: `src/lib/rate-limit.ts`

**Interfaces:**
- Produces (`verification.ts`, pure):

```ts
export interface VerifyRow {
  serial: string;
  type: "participation" | "winner";
  recipient_name: string | null;
  issued_at: string;
  revoked_at: string | null;
  superseded_by: string | null;
  group_label: string | null;
  event: { title: string; starts_at: string; ends_at: string | null; club_name: string | null } | null;
}
export type VerifyResult =
  | { state: "valid"; serial: string; name: string; eventTitle: string; clubName: string | null; eventDate: string; groupLabel: string; issuedDate: string }
  | { state: "superseded"; serial: string; eventTitle: string; issuedDate: string }
  | { state: "revoked"; serial: string; eventTitle: string; revokedDate: string }
  | { state: "unknown" };
export function toVerifyResult(row: VerifyRow | null): VerifyResult;
export async function atLeast<T>(ms: number, work: () => Promise<T>, clock?: { now(): number; sleep(ms: number): Promise<void> }): Promise<T>;
export const VERIFY_MIN_MS = 450;
```

- Produces (`verify-lookup.ts`, server): `lookupCertificate(serial: string): Promise<VerifyRow | null>`.
- Produces (`rate-limit.ts`): `checkVerifyLimits(ip: string): RateResult` (20 / minute).

- [ ] **Step 1: Write the failing test** (`verification.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { atLeast, toVerifyResult, type VerifyRow } from "./verification";

const row = (over: Partial<VerifyRow> = {}): VerifyRow => ({
  serial: "CSE-2026-7ZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ0",
  type: "participation",
  recipient_name: "Asha R",
  issued_at: "2026-09-14T06:00:00Z",
  revoked_at: null,
  superseded_by: null,
  group_label: "Volunteers",
  event: { title: "Hack Night", starts_at: "2026-09-12T04:30:00Z", ends_at: "2026-09-13T12:00:00Z", club_name: "Coding Club" },
  ...over,
});

describe("toVerifyResult", () => {
  it("a live certificate shows who, what, when and which group", () => {
    expect(toVerifyResult(row())).toEqual({
      state: "valid",
      serial: row().serial,
      name: "Asha R",
      eventTitle: "Hack Night",
      clubName: "Coding Club",
      eventDate: "12–13 September 2026",
      groupLabel: "Volunteers",
      issuedDate: "14 September 2026",
    });
  });

  it("falls back to the certificate type when no group label was stored", () => {
    expect(toVerifyResult(row({ group_label: null }))).toMatchObject({ groupLabel: "Participation" });
    expect(toVerifyResult(row({ group_label: null, type: "winner" }))).toMatchObject({ groupLabel: "Winner" });
  });

  it("a superseded certificate names the event but not the person", () => {
    const r = toVerifyResult(row({ revoked_at: "2026-09-15T00:00:00Z", superseded_by: "b3c0…" }));
    expect(r).toEqual({ state: "superseded", serial: row().serial, eventTitle: "Hack Night", issuedDate: "14 September 2026" });
  });

  it("a revoked certificate names the event and the date but not the person", () => {
    const r = toVerifyResult(row({ revoked_at: "2026-09-15T00:00:00Z" }));
    expect(r).toEqual({ state: "revoked", serial: row().serial, eventTitle: "Hack Night", revokedDate: "15 September 2026" });
    expect(JSON.stringify(r)).not.toContain("Asha");
  });

  it("no row, or a row whose event is gone, is not a valid certificate", () => {
    expect(toVerifyResult(null)).toEqual({ state: "unknown" });
    expect(toVerifyResult(row({ event: null }))).toEqual({ state: "unknown" });
  });
});

describe("atLeast", () => {
  function fakeClock(start = 1000) {
    let t = start;
    const slept: number[] = [];
    return {
      slept,
      advance: (ms: number) => (t += ms),
      clock: { now: () => t, sleep: async (ms: number) => { slept.push(ms); t += ms; } },
    };
  }

  it("pads a fast answer up to the minimum", async () => {
    const c = fakeClock();
    const v = await atLeast(450, async () => { c.advance(30); return "hit"; }, c.clock);
    expect(v).toBe("hit");
    expect(c.slept).toEqual([420]);
  });

  it("does not add delay to an answer that already took longer", async () => {
    const c = fakeClock();
    await atLeast(450, async () => { c.advance(900); return null; }, c.clock);
    expect(c.slept).toEqual([]);
  });

  it("still pads when the work throws, then rethrows", async () => {
    const c = fakeClock();
    await expect(atLeast(450, async () => { c.advance(10); throw new Error("db down"); }, c.clock)).rejects.toThrow("db down");
    expect(c.slept).toEqual([440]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/certificates/verification.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `verification.ts`**

```ts
import { formatEventDate, formatIstDate } from "./fields";

/**
 * What the public verify page may say about a serial (spec §7, SECURITY_SPEC §9).
 * The row type holds only the columns the page is allowed to read. Email, roll,
 * phone, team and the revoke reason are never selected, so they cannot leak
 * from here.
 */

export interface VerifyRow {
  serial: string;
  type: "participation" | "winner";
  recipient_name: string | null;
  issued_at: string;
  revoked_at: string | null;
  superseded_by: string | null;
  group_label: string | null;
  event: { title: string; starts_at: string; ends_at: string | null; club_name: string | null } | null;
}

export type VerifyResult =
  | { state: "valid"; serial: string; name: string; eventTitle: string; clubName: string | null; eventDate: string; groupLabel: string; issuedDate: string }
  | { state: "superseded"; serial: string; eventTitle: string; issuedDate: string }
  | { state: "revoked"; serial: string; eventTitle: string; revokedDate: string }
  | { state: "unknown" };

/** Every verify response takes at least this long, hit or miss. */
export const VERIFY_MIN_MS = 450;

export function toVerifyResult(row: VerifyRow | null): VerifyResult {
  if (!row || !row.event) return { state: "unknown" };
  const eventTitle = row.event.title;
  if (row.revoked_at && row.superseded_by) {
    return { state: "superseded", serial: row.serial, eventTitle, issuedDate: formatIstDate(row.issued_at) };
  }
  if (row.revoked_at) {
    return { state: "revoked", serial: row.serial, eventTitle, revokedDate: formatIstDate(row.revoked_at) };
  }
  return {
    state: "valid",
    serial: row.serial,
    name: row.recipient_name?.trim() ?? "",
    eventTitle,
    clubName: row.event.club_name,
    eventDate: formatEventDate(row.event.starts_at, row.event.ends_at),
    groupLabel: row.group_label?.trim() || (row.type === "winner" ? "Winner" : "Participation"),
    issuedDate: formatIstDate(row.issued_at),
  };
}

const realClock = { now: () => Date.now(), sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) };

/** Run `work`, then wait out the rest of `ms`, so hit and miss take the same time. */
export async function atLeast<T>(ms: number, work: () => Promise<T>, clock = realClock): Promise<T> {
  const start = clock.now();
  try {
    return await work();
  } finally {
    const left = ms - (clock.now() - start);
    if (left > 0) await clock.sleep(left);
  }
}
```

(`fields.ts` has no `server-only` import and no Node-only dependencies. Confirm with `head -5 src/lib/certificates/fields.ts` before relying on it.)

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/certificates/verification.test.ts`
Expected: PASS. (`12–13 September 2026` uses an en dash, the same one `formatEventDate` emits.)

- [ ] **Step 5: Server lookup + rate limit**

`src/lib/certificates/verify-lookup.ts`:

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { VerifyRow } from "./verification";

/**
 * Look a certificate up by serial for the public verify page. Service role,
 * because `certificates` has no anon grant. The select names only what the page
 * may show, plus the two columns that say whether the certificate is still live.
 * `snapshot` is read by one key (`groupLabel`), never whole, since it also
 * holds the recipient's email and roll.
 */
export async function lookupCertificate(serial: string): Promise<VerifyRow | null> {
  const { data, error } = await createAdminClient()
    .from("certificates")
    .select(
      "serial, type, recipient_name, issued_at, revoked_at, superseded_by, group_label:snapshot->>groupLabel, events ( title, starts_at, ends_at, event_clubs ( is_primary, clubs ( name ) ) )",
    )
    .eq("serial", serial)
    .maybeSingle();
  if (error) throw new Error(`certificate lookup failed: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as Omit<VerifyRow, "event"> & {
    events: { title: string; starts_at: string; ends_at: string | null; event_clubs: { is_primary: boolean; clubs: { name: string } | null }[] } | null;
  };
  const primary = row.events?.event_clubs.find((c) => c.is_primary) ?? row.events?.event_clubs[0];
  return {
    serial: row.serial,
    type: row.type,
    recipient_name: row.recipient_name,
    issued_at: row.issued_at,
    revoked_at: row.revoked_at,
    superseded_by: row.superseded_by,
    group_label: row.group_label,
    event: row.events
      ? { title: row.events.title, starts_at: row.events.starts_at, ends_at: row.events.ends_at, club_name: primary?.clubs?.name ?? null }
      : null,
  };
}
```

`src/lib/rate-limit.ts`, after `checkRollLookupLimits`:

```ts
/** Public certificate verification: 20 per IP / minute (spec §7). */
export function checkVerifyLimits(ip: string): RateResult {
  return rateLimit(`verify:ip:${ip}`, 20, MIN);
}
```

- [ ] **Step 6: The lookup form and the two pages**

`src/components/verify/VerifyLookupForm.tsx` (a server component with a plain GET form, so it works without JS):

```tsx
export function VerifyLookupForm({ defaultValue, notice }: { defaultValue?: string; notice?: string | null }) {
  return (
    <form method="get" action="/verify" style={{ display: "grid", gap: 12 }}>
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="serial">Serial number</label>
        <input
          id="serial"
          name="serial"
          defaultValue={defaultValue}
          maxLength={80}
          autoComplete="off"
          spellCheck={false}
          placeholder="CSE-2026-XXXXX-XXXXX-XXXXX-XXXXX-XXXXXX"
          style={{ fontFamily: "var(--mono)" }}
        />
        {notice ? <p className="hint" style={{ color: "var(--rust)" }}>{notice}</p> : null}
      </div>
      <button className="btn btn-primary" style={{ width: "100%" }}>
        Check certificate
      </button>
    </form>
  );
}
```

`src/app/verify/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { normalizeSerial } from "@/lib/certificates/serial";
import { VerifyLookupForm } from "@/components/verify/VerifyLookupForm";

export const metadata = { title: "Verify a certificate", robots: { index: false } };

export default async function VerifyLookupPage({ searchParams }: { searchParams: Promise<{ serial?: string }> }) {
  const { serial } = await searchParams;
  const typed = typeof serial === "string" ? serial.slice(0, 80) : "";
  const normalized = typed ? normalizeSerial(typed) : null;
  if (normalized) redirect(`/verify/${encodeURIComponent(normalized)}`);

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "clamp(32px, 6vw, 64px) 20px" }}>
      <div className="eyebrow">CSE Council</div>
      <h1 style={{ margin: "8px 0 10px" }}>Verify a certificate</h1>
      <p className="lead" style={{ marginBottom: 24 }}>
        Scan the QR code on a certificate, or type the serial number printed on it.
      </p>
      <div className="panel" style={{ padding: "clamp(18px, 4vw, 24px)" }}>
        <VerifyLookupForm
          defaultValue={typed}
          notice={typed ? "That isn’t a certificate serial. It starts with CSE- and the year." : null}
        />
      </div>
    </div>
  );
}
```

`src/app/verify/[serial]/page.tsx`: the result page. A `VerifyCard` inner component renders each state:

```tsx
import { headers } from "next/headers";
import { checkVerifyLimits } from "@/lib/rate-limit";
import { normalizeSerial } from "@/lib/certificates/serial";
import { atLeast, toVerifyResult, VERIFY_MIN_MS, type VerifyResult } from "@/lib/certificates/verification";
import { lookupCertificate } from "@/lib/certificates/verify-lookup";
import { VerifyLookupForm } from "@/components/verify/VerifyLookupForm";

export const metadata = { title: "Certificate check", robots: { index: false } };

type Outcome = { kind: "result"; result: VerifyResult } | { kind: "limited" } | { kind: "error" };

export default async function VerifyPage({ params }: { params: Promise<{ serial: string }> }) {
  const { serial: raw } = await params;
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const outcome = await atLeast<Outcome>(VERIFY_MIN_MS, async () => {
    if (!checkVerifyLimits(ip).ok) return { kind: "limited" };
    const serial = normalizeSerial(decodeURIComponent(raw));
    if (!serial) return { kind: "result", result: { state: "unknown" } };
    try {
      return { kind: "result", result: toVerifyResult(await lookupCertificate(serial)) };
    } catch (err) {
      console.error("verify lookup failed:", err instanceof Error ? err.message : err);
      return { kind: "error" };
    }
  });

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "clamp(32px, 6vw, 64px) 20px" }}>
      <div className="eyebrow">CSE Council · Certificate check</div>
      {outcome.kind === "limited" ? (
        <Message title="Too many checks" body="Please wait a minute and try again." />
      ) : outcome.kind === "error" ? (
        <Message title="We couldn’t check that just now" body="Please try again in a moment." />
      ) : (
        <VerifyCard result={outcome.result} />
      )}
      <details className="panel" style={{ marginTop: 28, padding: "14px clamp(18px, 4vw, 24px)" }}>
        <summary className="label" style={{ cursor: "pointer" }}>Check another certificate</summary>
        <div style={{ marginTop: 14 }}>
          <VerifyLookupForm />
        </div>
      </details>
    </div>
  );
}
```

`VerifyCard` layout (same file):
- **valid**: `<h1>` "Valid certificate" with a forest ✓ mark. `<h2>` the name (serif). A definition list of Event · Club (only when present) · Event date · Certificate (group label) · Issued · Serial (mono, `overflow-wrap: anywhere`).
- **superseded**: `<h1>` "Replaced by a newer certificate" in `--ink-2`. Body: "This certificate for **{event}**, issued {date}, has been replaced. The holder has a newer one." Serial shown.
- **revoked**: `<h1>` "Revoked" in `--rust`. Body: "This certificate for **{event}** was revoked on {date} and is no longer valid." Serial shown.
- **unknown**: `<h1>` "Not a valid certificate". Body: "No certificate has this serial. Check it was typed exactly as printed." No echo of the raw input.

The definition list is a two-column grid (`grid-template-columns: minmax(96px, auto) 1fr`) that stacks below 400 px. Add a small `.verify-facts` block to `globals.css` under `@layer components`:

```css
  /* /verify/[serial] — the facts on a certificate check */
  .verify-facts { display: grid; grid-template-columns: minmax(96px, auto) 1fr; gap: 10px 18px; margin: 18px 0 0; }
  .verify-facts dt { font: 500 10px var(--mono); letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-3); padding-top: 3px; }
  .verify-facts dd { margin: 0; font: 400 14px / 1.5 var(--sans); color: var(--ink); overflow-wrap: anywhere; }
  @media (max-width: 400px) { .verify-facts { grid-template-columns: 1fr; gap: 2px; } .verify-facts dd { margin-bottom: 10px; } }
```

- [ ] **Step 7: Typecheck, lint, tests**

Run: `npm run typecheck && npm run lint && npx vitest run src/lib/certificates`
Expected: green. If `select("… group_label:snapshot->>groupLabel …")` fails supabase-js's type parser, the `as unknown as` cast already covers it. If `tsc` rejects the select string itself, widen with `.select<string, unknown>(…)` or split the JSON read out.

- [ ] **Step 8: Verify against the live database, read-only**

1. Read one real serial per state with Supabase MCP `execute_sql` (read-only): `select serial, revoked_at is not null as revoked, superseded_by is not null as superseded from certificates order by issued_at desc limit 20;`. Do not print names.
2. `npm run dev`, then curl each state. Check the state heading and that none of the recipient's email/roll appears:
   `curl -s localhost:3000/verify/<serial> | grep -o "Valid certificate\|Revoked\|Replaced by a newer certificate\|Not a valid certificate"`
3. Unknown serial: `curl -s localhost:3000/verify/CSE-2026-00000-00000-00000-00000-000000` → "Not a valid certificate".
4. Lookup redirect: `curl -s -o /dev/null -w "%{http_code} %{redirect_url}" "localhost:3000/verify?serial=cse-2026-…"` → 307 to the canonical path.
5. Timing: `for i in 1 2 3; do curl -s -o /dev/null -w "%{time_total}\n" localhost:3000/verify/<hit>; curl -s -o /dev/null -w "%{time_total}\n" localhost:3000/verify/<miss>; done`. Both should be ≥ 0.45 s and similar once warm.
6. Rate limit: 21 requests in a loop. The 21st says "Too many checks".
7. `robots`: `curl -s localhost:3000/verify/<serial> | grep -o '<meta name="robots"[^>]*>'` → `noindex`.
8. Look at a valid, a revoked and an unknown page in a browser at desktop and 400 px width, light and dark.

- [ ] **Step 9: Commit**

```bash
git add src/lib/certificates/verification.ts src/lib/certificates/verification.test.ts src/lib/certificates/verify-lookup.ts src/lib/rate-limit.ts src/components/verify src/app/verify src/app/globals.css
git commit -m "feat(certificates): public /verify page — valid, replaced, revoked or unknown, with nothing personal leaked"
```

---

### Task 6: Gate and document

**Files:** `docs/STATUS.md`, `docs/SECURITY_SPEC.md`

- [ ] **Step 1: Full gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all green. Record the test count.

- [ ] **Step 2: End-to-end render check with a real serial and the real renderer**

Write a throwaway script in `$CLAUDE_JOB_DIR/tmp` (never in the repo) that renders a one-page PDF with a QR element and `cert.serial = newCertificateSerial()` output. Open it in a browser, screenshot the QR and decode it if a decoder is available. It must read `<NEXT_PUBLIC_SITE_URL>/verify/<that serial>`.

- [ ] **Step 3: SECURITY_SPEC §9 serial line**

Replace `Serial: 128 bits from crypto.randomBytes, rendered as CSE-2026-XXXX-XXXX.` with `Serial: 128 bits from crypto.randomBytes, Crockford base32, rendered as CSE-2026-XXXXX-XXXXX-XXXXX-XXXXX-XXXXXX (v1's 32-bit CSE-2026-XXXXXXXX serials issued before 2026-09-14 remain valid).`

- [ ] **Step 4: STATUS.md**

Add a "phase 3" block above the phase 2 block, in the same form: what shipped, gate numbers, "no migration", the browser checks that were done, and the owed human walkthrough:
- Scan a real emailed certificate's QR with a phone.
- Revoke one and scan again: it must show "Revoked".
- Re-issue one and scan the old PDF: it must show "Replaced".

Update the "Not built yet" line: phases 1–3 are complete, and the branch is ready to merge once the walkthroughs are done.

- [ ] **Step 5: Commit**

```bash
git add docs/STATUS.md docs/SECURITY_SPEC.md
git commit -m "docs(status): certificate designer phase 3 built; owed human walkthrough"
```
