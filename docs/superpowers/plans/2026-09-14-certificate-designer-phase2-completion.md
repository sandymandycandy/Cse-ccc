# Certificate Designer — Phase 2 Completion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gaps between the phase 2 spec and what was built, so phase 2 is actually complete.

**Architecture:** No new tables and no migration. The work adds one pure selection function (which issued certificates are outdated) and one batched server routine next to `issueBatch` (re-issue by destination). The renderer learns to take a design per page. The preview route gains a GET for a saved design, and the hub counts people the way the Recipients tab does.

**Tech Stack:** as phases 1–3.

**Spec:** `docs/superpowers/specs/2026-09-14-certificate-designer-design.md`: §1 (hub count), §3.2 (Recipients tab), §5.3 (re-issue all), §5.5 (downloads), §8 (audit).

## Audit: spec vs. built (2026-09-14)

| Spec | Built? | Gap |
| --- | --- | --- |
| §5.3 **Re-issue all with latest design**, in batches, behind a confirm stating the count | ❌ | Only per-row re-issue exists |
| §3.2 row action **Preview** (PDF, watermarked if not issued) · §5.5 `GET …/preview?group=&recipient=` | ❌ | Preview exists only as the Design tab's POST of the unsaved design |
| §5.5 print booklet, §5.1 "any later download renders from (design version, snapshot)" | 🐞 | Booklet draws every page with the group's **current** design |
| §1 hub "per-event issued / **total count across groups**" | 🐞 | Shows certificates ÷ attended *registrations*, so a 4-person team reads 4 / 1; events with only an uploaded list are not listed |
| §3.2 search by **roll** · status "Issued · serial · date" · "Re-issue & email" vs "Re-issue" | 🟡 | No roll search; serial/date only in a tooltip; labels never say whether it emails |
| §3.3 sheet upload, groups CRUD, revoke, ZIP, audit rows | ✅ | — |

## Decisions

- **"Re-issue all" re-issues the *outdated* certificates, not literally every live one.** A certificate is outdated when it was issued with a design version other than the group's current design, **or** when a field the design prints now has a different value for that person (a corrected name, say). `cert.serial` and `cert.issueDate` are excluded, since they always differ. This is what makes the batch loop resumable: a re-issued certificate stops being outdated, so Stop-then-run continues where it left off and nobody gets two replacements. "Every live certificate" would never shrink.
- **Replacements go out by destination, like first issues.** A leader holding their team's certificates gets one email carrying every replacement, split over 20 MB. People with no address are re-issued for download.
- Each re-issue supersedes through the existing `supersede_certificate` RPC; a failed render or send calls `undo_supersede`, so the old certificate is live again.
- One audit row per batch lists every `old → new` serial (≤ 40 per batch).

## File map

| File | Change | Task |
| --- | --- | --- |
| `src/lib/certificates/recipients.ts` (+test) | `printedFields`, `isOutdated`, `outdatedRecipients` | 1 |
| `src/lib/certificates/render.ts` (+test) | per-page `design` | 2 |
| `src/lib/admin/certificate-issue.ts` | `getIssuedCertificates(ids)`, shared supersede helper, `reissueOutdatedBatch`, `countOutdated` | 2, 3 |
| `src/lib/admin/certificates.ts` | `designHash`, `findDesignVersion`, `liveCertificateDetails`, hub counts | 3, 5 |
| `src/app/api/admin/events/[id]/certificates/print/route.ts` | each page with its own design, batch load | 2 |
| `src/app/admin/(app)/events/[id]/certificates/actions.ts` | `reissueOutdatedBatchAction` | 3 |
| `src/components/admin/certificates/IssuePanel.tsx` | Re-issue outdated section (confirm, progress, Stop) | 3 |
| `src/app/api/admin/events/[id]/certificates/preview/route.ts` | `GET ?group=&recipient=` | 4 |
| `src/components/admin/certificates/RecipientsPanel.tsx`, `page.tsx` | Preview link, roll search, serial/date, email-aware labels | 4 |
| `src/lib/admin/certificates.ts`, `src/app/admin/(app)/certificates/page.tsx` | issued / people across groups | 5 |
| dev harness | Issue panel sample; Recipients rows with roll | 3, 4 |
| `docs/STATUS.md` | phase 2 block updated | 6 |

---

### Task 1: Which certificates are outdated (pure)

**Files:** `src/lib/certificates/recipients.ts`, `src/lib/certificates/recipients.test.ts`

**Produces:**

```ts
/** Field keys a design prints (visible text elements), excluding the per-certificate cert.serial / cert.issueDate. */
export function printedFields(design: Design): string[];

export interface LiveCertificate { designVersionId: string | null; values: FieldValues }

/** Issued with another design, or a printed value has changed since. */
export function isOutdated(input: { live: LiveCertificate; currentVersionId: string | null; printed: string[]; current: FieldValues }): boolean;

/** The issued recipients whose certificate is outdated, in list order. */
export function outdatedRecipients(
  recipients: Recipient[],
  live: Map<string, LiveCertificate>,              // by certificate id
  groups: Map<string, { versionId: string | null; printed: string[] }>, // by group id
): Recipient[];
```

- [ ] Tests first:
  - Same version and same values → not outdated.
  - Different version → outdated.
  - `currentVersionId` null (the current design was never issued) → outdated.
  - A printed value changed (`person.name` "asha r" → "Asha R") → outdated.
  - An unprinted value changed (`person.phone`) → not outdated.
  - `cert.serial` / `cert.issueDate` are ignored.
  - `printedFields` skips hidden elements, image and qr elements, and dedupes.
  - `outdatedRecipients` returns only issued recipients, keeps list order, and skips an issued recipient whose certificate has no loaded details.
- [ ] Run → fail. Implement → pass. Commit.

---

### Task 2: The print booklet draws each certificate with its own design

**Files:** `render.ts` (+test), `certificate-issue.ts`, `print/route.ts`

**Produces:** `RenderInput.pages: { valueFor; design?: Design }[]`, where a page's `design` overrides `input.design` for that page (page size included). `getIssuedCertificates(ids: string[]): Promise<IssuedCertificate[]>` loads in chunks of 100, preserving input order.

- [ ] Test first (`render.test.ts`): two pages, the second with a portrait design and a different template, give two pages of different sizes, and each template is loaded exactly once.
- [ ] Implement: inside the page loop, `const design = entry.design ?? input.design` and compute `W, H, k, pageW, pageH` per page.
- [ ] Print route: `const certs = await getIssuedCertificates(ids)` and `pages = certs.map((c) => ({ design: c.design, valueFor: (k) => c.values[k] ?? "" }))`. Fix the comment. `design:` in the input stays the group design (the fallback).
- [ ] Typecheck + tests. Commit.

---

### Task 3: Re-issue outdated certificates, in batches

**Files:** `certificates.ts`, `certificate-issue.ts`, `actions.ts`, `IssuePanel.tsx`, `page.tsx`, the dev harness

**Produces:**
- `designHash(design): string` (shared by `ensureDesignVersion`) · `findDesignVersion(groupId, design): Promise<string | null>` (no insert) · `liveCertificateDetails(eventId): Promise<Map<string, LiveCertificate>>`.
- `countOutdated(event, groups, recipients): Promise<Map<groupId, number>>`.
- `reissueOutdatedBatch({ eventId, groupIds, actorId }): Promise<ReissueBatchResult | { error }>` where `ReissueBatchResult = { processed, reissued, emails, failed, remaining }`.
- `reissueOutdatedBatchAction({ eventId, groupIds })` (same `authorize` as the other actions).

Server routine:
1. Load event and groups; run `designProblem` on each chosen group.
2. `recipients` (chosen groups) → `outdatedRecipients` with each group's `findDesignVersion` and `printedFields`.
3. Addressed ones → `cutBatch(groupByDestination(…), ISSUE_BATCH)`. If that holds fewer than `ISSUE_BATCH`, top up with no-address ones.
4. Per recipient: `supersede` (a shared helper, also used by `reissueForRecipient`) → render. A render failure → `undo_supersede`, `failed++`.
5. Per destination: `chunkBySize` → one email per chunk ("Your updated certificate — …" / "Updated certificates — … (n)", body "These replace the certificates we sent earlier."). A send failure → `undo_supersede` for every row in the chunk.
6. No-address ones: supersede only (no render).
7. One audit row: `action: "reissue"`, `entity: "certificate"`, `entityId: eventId`, `after: { mode: "outdated", groups, reissued, failed, emails, serials: [{ from, to }] }`.

UI (`IssuePanel`): a "Replace outdated certificates" block, shown when `outdated > 0`. The button reads "Re-issue N outdated…", and the confirm says: "N people get a replacement — M by email, the rest for download. Their old certificates will show as replaced when checked." Progress uses the same Stop / resume / stop-when-a-batch-fully-fails behaviour as issuing. With nothing outdated, a hint reads "Everyone issued has the latest design and details."

- [ ] Browser: add an **Issue** panel to `/dev/certificate-designer` with sample counts (`outdated: 3`). Check that the confirm shows the counts, Cancel closes it, and Run reports the session error cleanly.
- [ ] Typecheck/lint/tests. Commit.

---

### Task 4: Recipients tab — Preview, roll search, serial/date, honest labels

**Files:** `preview/route.ts`, `RecipientsPanel.tsx`, `page.tsx`, `RecipientsHarness.tsx`

- [ ] `GET /api/admin/events/[id]/certificates/preview?group=<uuid>&recipient=<key>`: `requireSession` → `canManage` → the **saved** group design + that recipient's values, with `cert.serial = "CSE-PREVIEW"` and today's date. Watermark `PREVIEW`, `verifyOrigin` fallback, `no-store`, inline. 404 if the group or recipient is gone.
- [ ] `RecipientRow` gains `roll: string` and `deliverTo: string | null`. Search covers roll.
- [ ] Row for an **issued** person: "Issued" badge plus a small serial · date line; Download; "Re-issue & email" or "Re-issue" (address-aware).
- [ ] Row for **pending/revoked**: "Preview" (opens the PDF in a new tab); "Issue & email" / "Issue now" / "Issue again (& email)".
- [ ] Harness rows get rolls. Over CDP, check: roll search, the Preview link `href` (encoded key), the serial/date line, the labels, no page errors.
- [ ] Commit.

---

### Task 5: Hub counts people across groups

**Files:** `certificates.ts`, `src/app/admin/(app)/certificates/page.tsx`

- [ ] `listCertificateEvents()` → `{ id, title, startsAt, people, issued }[]` for every event with an attendee, a certificate or a sheet group. For each event, use `getCertEvent` + its groups, **read-only** (no `ensureParticipantsGroup`; a stand-in Participants group when none exists yet) + `listAllRecipients`. `people` = recipients, `issued` = recipients with `status.state === "issued"`, the same numbers as the Recipients tab.
- [ ] Hub table: columns **People** and **Issued** (badge when all issued). Copy mentions uploaded lists.
- [ ] Verify against the live DB, read-only, with a scratch script (not committed): the numbers for the one event with attendees equal attended registrations expanded by team members.
- [ ] Commit.

---

### Task 6: Gate and document

- [ ] `npm run typecheck && npm run lint && npm test && npm run build`.
- [ ] STATUS.md: update the phase 2 block (the gaps closed, new owed walkthrough steps: re-issue outdated after a design edit, the leader gets one replacement mail; row Preview; booklet after a design change) and remove the booklet bug from the phase 3 block.
- [ ] Commit.
