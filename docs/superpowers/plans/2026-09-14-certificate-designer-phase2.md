# Certificate Designer — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everyone who earned a certificate can get one, and a wrong one can be put right. Adds per-member team certificates, uploaded recipient groups (volunteers, judges), the Recipients tab with per-person warnings and actions, downloads (single / ZIP / print), re-issue and revoke.

**Architecture:** Phase 1's single Participants group becomes many groups per event, each with its own design. Recipients are assembled from three sources — registrants, their team members, and uploaded sheet rows — into one list keyed by a stable `recipient_key`. Issuing groups recipients by **destination address** so one person receives one email with every PDF meant for them. Re-issue supersedes through the existing RPC; revoke is gated on `revoke:certificate`.

**Tech Stack:** as phase 1, plus `read-excel-file` (browser XLSX → rows) and `fflate` (browser ZIP).

**Spec:** `docs/superpowers/specs/2026-09-14-certificate-designer-design.md` — §3 (recipients, sheet upload), §5.2–5.5 (issuing, re-issue, revoke, downloads), §8 (security), §11 (phase 2 scope).

**Phase 1 is merged into this branch** (`feat/certificate-designer`, 16 commits): design model, layout engine, renderer, groups schema, issuing, editor UI. **No new migration** — phase 1 applied `certificate_sheet_rows`, `replace_certificate_sheet_rows`, `supersede_certificate` and `undo_supersede` already.

## Global Constraints

Phase 1's constraints all still hold. In addition:

- **Revoke is gated on `revoke:certificate`** (Faculty Advisor / VP / Tech Head only). Everyone with `issue:participation_certificate` may **re-issue**, which supersedes rather than revokes.
- **One email per destination address**, carrying every PDF bound for it; split when attachments exceed **20 MB**.
- A batch takes **whole destinations** until it has ≥ 40 recipients, so a leader's team is never split across two runs.
- Sheet limits, client **and** server: ≤ 1,000 rows · ≤ 30 columns · header ≤ 80 chars · cell ≤ 500 chars · payload ≤ 900 KB.
- Sheet rows are PII: service-role only, never reachable by anon/authenticated (already enforced by the phase 1 migration).
- Every download route carries the same capability + club-scope guard and `Cache-Control: no-store`.

## File map

| File | Responsibility | Task |
| --- | --- | --- |
| `src/lib/certificates/recipients.ts` | Extended: keys for members and sheet rows, destination grouping, batch cutting, attachment chunking | 1 |
| `src/lib/certificates/fields.ts` | Extended: `memberValues`, `sheetValues` | 1 |
| `src/lib/certificates/sheet.ts` | CSV parse, header detection, row validation | 2 |
| `src/lib/certificates/warnings.ts` | Per-recipient design warnings (empty fields, overflow, missing glyphs) | 3 |
| `src/lib/admin/certificates.ts` | Extended: all groups, all recipients (registrant + member + sheet), per-group counts | 4 |
| `src/lib/admin/certificate-issue.ts` | Rework: destination batching, multi-attachment email, re-issue, revoke | 5 |
| `src/app/admin/(app)/events/[id]/certificates/actions.ts` | Extended: group CRUD, sheet upload, re-issue (one + all), revoke | 6 |
| `src/app/api/admin/certificates/[certId]/pdf/route.ts` | One issued certificate from its snapshot | 6 |
| `src/app/api/admin/events/[id]/certificates/print/route.ts` | Combined multi-page print PDF | 6 |
| `src/components/admin/certificates/RecipientsPanel.tsx` | The Recipients tab | 7 |
| `src/components/admin/certificates/SheetUpload.tsx` | Pick a file, confirm columns, upload | 7 |
| `src/components/admin/certificates/zip.ts` | Browser ZIP of selected certificates | 7 |
| `src/components/admin/certificates/GroupBar.tsx` | Group picker + add/rename/delete | 7 |
| `src/app/admin/(app)/events/[id]/certificates/page.tsx` | Three tabs: Design · Recipients · Issue | 7 |
| `src/app/globals.css` | Recipients table + upload styles | 7 |
| `docs/STATUS.md` | Phase 2 entry | 8 |

---

### Task 1: Recipient identity, destinations and batching

**Files:** `src/lib/certificates/recipients.ts`, `src/lib/certificates/fields.ts` (+ tests)

**Produces:**
- `Recipient` gains `groupId`, `groupLabel`, `kind: "registration" | "member" | "sheet"`, `teamLabel: string | null`, `deliverTo: string | null` (where it is actually emailed), `viaLeader: boolean`.
- `memberKey(registrationId, member, taken)`, `sheetKey(groupId, row, taken)` — stable, deduped with `#2`, `#3`.
- `groupByDestination(recipients): Destination[]` — one entry per lowercase address, recipients in list order.
- `cutBatch(destinations, minRecipients)` — whole destinations until the count is met.
- `chunkBySize(items, sizeOf, maxBytes)` — attachment splitting.
- `fields.ts`: `memberValues({ event, schema, registration, member, groupLabel })`, `sheetValues({ event, columns, row, groupLabel })`.

- [ ] Write failing tests: member keys incl. duplicate rolls, sheet keys, leader fallback, destination grouping, batch cut at destination boundary, size chunking, member/sheet value resolution.
- [ ] Implement. Run tests.
- [ ] Commit.

### Task 2: Sheet parsing

**Files:** `src/lib/certificates/sheet.ts` (+ test)

**Produces:** `parseDelimited(text)`, `detectColumns(header)`, `buildSheetRows(rows, choice)` → `{ rows, dropped, invalidEmails, error? }`, `SHEET_LIMITS`.

- [ ] Write failing tests: quoted fields with commas and escaped quotes, CRLF, BOM, `;`/tab delimiters, header detection (ignoring "team name"), limits, dropped rows, invalid emails.
- [ ] Implement. Run tests.
- [ ] Commit.

### Task 3: Per-recipient warnings

**Files:** `src/lib/certificates/warnings.ts` (+ test)

**Produces:** `recipientWarnings(design, valueFor, metrics)` → `{ emptyFields: string[]; overflow: string[]; missingGlyphs: string }`, and `warningLines(...)` for display.

- [ ] Write failing tests: empty field named by its label, shrink box at minimum scale, wrap box off the page, unprintable characters.
- [ ] Implement using `layoutText`. Run tests.
- [ ] Commit.

### Task 4: Data layer — groups and every recipient

**Files:** `src/lib/admin/certificates.ts`

**Produces:** `listGroups(eventId)`, `createSheetGroup`, `renameGroup`, `deleteSheetGroup`, `listSheetRows(groupId)`, `replaceSheetRows(groupId, rows)`; `listAllRecipients(event, groups)` covering registrants + team members + sheet rows; workspace carries `groups`, `recipients` (all groups), `countsByGroup`.

- [ ] Extend the module; keep `getCertificateWorkspace` as the single page loader.
- [ ] Typecheck the module.
- [ ] Commit.

### Task 5: Issuing rework, re-issue, revoke

**Files:** `src/lib/admin/certificate-issue.ts`

**Produces:** `issueBatch({ eventId, groupIds, mode, actorId })` grouped by destination with multi-attachment mail; `reissueCertificate({ eventId, certificateId, actorId })`; `revokeCertificate({ eventId, certificateId, reason, actorId })`; `renderForCertificate(certificateId)` for the download routes.

- [ ] Rework issuing to iterate destinations; email carries every PDF for that address; a failed send rolls back **all** rows reserved for it.
- [ ] Re-issue through `supersede_certificate`, rolled back with `undo_supersede` when the email fails.
- [ ] Revoke sets `revoked_at` + reason, audited.
- [ ] Typecheck. Commit.

### Task 6: Actions and download routes

**Files:** `actions.ts`, `api/admin/certificates/[certId]/pdf/route.ts`, `api/admin/events/[id]/certificates/print/route.ts`

- [ ] Actions: `createCertificateGroupAction`, `renameCertificateGroupAction`, `deleteCertificateGroupAction`, `uploadCertificateSheetAction`, `reissueCertificateAction`, `reissueAllAction`, `revokeCertificateAction`. Each guarded; revoke additionally requires `revoke:certificate`.
- [ ] Routes: single PDF from snapshot; print PDF (one document, template embedded once, streamed).
- [ ] ESLint (admin-route-guard) + typecheck. Commit.

### Task 7: Recipients tab and group bar

**Files:** `RecipientsPanel.tsx`, `SheetUpload.tsx`, `GroupBar.tsx`, `zip.ts`, `page.tsx`, `globals.css`

- [ ] Three tabs; group picker on Design; Recipients table with search, group/status filters, warnings and row actions; sheet upload with a column-confirm step; ZIP + print download buttons.
- [ ] Lint + typecheck. Commit.

### Task 8: Verify and document

- [ ] Full gate: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- [ ] Drive the dev harness and the new panels in Chrome over CDP as in phase 1.
- [ ] STATUS.md entry, including what still needs a human (real sends).
- [ ] Commit.
