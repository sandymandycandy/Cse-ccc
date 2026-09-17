# Winner certificates — phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every event gets a Winners group whose people come from its published results (ranks 1–3, ties included) or from an uploaded list with a Position column, issued as `type: 'winner'` and verifiable as "Winner · 1st place".

**Architecture:** A third base slot (`winners`) whose group `kind` records its source: `results` or `sheet`. A pure `winners.ts` picks the podium round and turns standings into recipients, reusing `podiumOf`/`entrantsOf` so the board, the results page and certificates can never disagree. Winner recipients get `win:` keys, so one person may hold a participation **and** a winner certificate under the existing one-live-per-recipient index.

**Tech Stack:** Next.js 16 App Router, Supabase service role, zod, vitest.

**Spec:** `docs/superpowers/specs/2026-09-15-certificate-base-templates-design.md` §4 (and §9 phase 2). Phase 1 plan: `2026-09-15-certificate-bases-phase1.md`.

## Global Constraints

- No migration. Phase 1 already added `certificate_base_kind.winners`, `certificate_group_kind.results` and `certificate_groups.position_column`.
- Winners use **`issue:winner_certificate`**; every other group keeps `issue:participation_certificate`. Revoke is unchanged.
- The podium round is **the highest-`sort` round with at least one published result** — the rule the achievements board already uses. Factor it out; never write a second rule.
- `winner.*` fields are offered **only** on a Winners group and in the Winners base.
- Positions parse from `1`, `1st`, `first` (case-insensitive) to 1–3. Anything else prints **verbatim**.
- Switching a Winners group's source is refused while it holds any live certificate: `N winner certificates were issued from <source>. Revoke them before switching.`
- LF endings, and the full gate (`typecheck`, `lint`, `test`, `build`) before claiming done.
- Commits end with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

## File map

| File | Responsibility |
| --- | --- |
| `src/lib/certificates/winners.ts` (new) + test | Pure: podium round, standings, place wording, Position parsing/detection |
| `src/lib/achievements-board.ts` / `src/lib/queries.ts` | Use the shared `podiumRound` |
| `src/lib/certificates/fields.ts` + test | Winner field group, winner values |
| `src/lib/certificates/design.ts` + test | `winner.*` valid only where allowed |
| `src/lib/certificates/recipients.ts` + test | `win:` keys, orphan certificates |
| `src/lib/certificates/bases.ts` | Enable the `winners` base |
| `src/lib/admin/certificate-winners.ts` (new) | Server: read the podium standings |
| `src/lib/admin/certificates.ts` | Winners slot, winner recipients, both cert types |
| `src/lib/admin/certificate-issue.ts` | `type: 'winner'`, winner email copy |
| `src/app/admin/(app)/events/[id]/certificates/actions.ts` | Winner capability, source switch |
| `src/lib/certificates/verification.ts` + test, `verify-lookup.ts` | "Winner · 1st place" |
| `src/components/admin/certificates/*`, `page.tsx` | Source switch, empty state, orphan rows |
| `docs/STATUS.md` | Phase 2 block + owed walkthrough |

---

### Task 1: Pure winners module

**Files:** create `src/lib/certificates/winners.ts` + `winners.test.ts`; modify `src/lib/queries.ts` (board's auto half) to use `podiumRound`.

**Interfaces — Produces:**
- `type Place = 1 | 2 | 3`
- `interface StandingLike { roll_no: string; display_name: string | null; team_name: string | null; team_members: { name: string; roll: string }[] | null; rank: number | null; registration_id?: string | null }`
- `interface WinnerStanding { place: Place; rollNo: string; displayName: string | null; teamName: string | null; teamMembers: { name: string; roll: string }[]; registrationId: string | null }`
- `podiumRound<T extends { sort: number; results: { published_at: string | null }[] }>(rounds: readonly T[]): T | null`
- `standingsOf(results: readonly StandingLike[]): WinnerStanding[]`
- `placeText(place: Place): string` → `1st|2nd|3rd`
- `placeWords(place: Place): string` → `First|Second|Third`
- `parsePosition(raw: string): string` — normalises to `1st|2nd|3rd`, else the trimmed input
- `detectPositionColumn(header: string[]): number | null`

- [ ] **Step 1: Write `winners.test.ts`** covering: highest-sort round with published results wins (an unplayed later round is skipped); no published round → null; `standingsOf` keeps ties (`1,2,3,3`) and drops ranks over 3 and nulls; place wording; `parsePosition` for `1`/`1st`/`First`/`ONE`(verbatim)/`runner-up`(verbatim)/empty; `detectPositionColumn` for Position/Rank/Place/Prize and null when absent.
- [ ] **Step 2: Run it — expect "Cannot find module './winners'".**
- [ ] **Step 3: Write `winners.ts`** — `podiumRound` sorts a copy by `sort` desc and finds the first round with a published result; `standingsOf` calls `podiumOf` then narrows `rank` to 1–3.
- [ ] **Step 4: Point the achievements board at `podiumRound`** in `src/lib/queries.ts` (replace the inline sort/find) so there is one rule.
- [ ] **Step 5:** `npx vitest run src/lib/certificates/winners.test.ts src/lib/achievements-board.test.ts` — PASS.
- [ ] **Step 6: Commit** `feat(certificates): podium round, winner standings and position wording`.

---

### Task 2: Winner fields

**Files:** `src/lib/certificates/fields.ts` + test, `src/lib/certificates/design.ts` + test, `src/lib/certificates/bases.ts`.

**Interfaces — Produces:**
- `FieldGroup["id"]` gains `"winner"`; `buildFieldCatalogue({ …, winnerFields?: boolean })` adds Position / Position in words.
- `DesignContext` gains `winnerFields: boolean`; `isKnownField` accepts `winner.place` / `winner.placeWords` only when true.
- `designContextFor(schema, sheetColumns, winnerFields = false)`.
- `winnerValues(input)` → the same shape as `sheetValues` plus `winner.*`.
- `ENABLED_BASE_KINDS` includes `winners`.

- [ ] **Step 1:** tests — catalogue offers Winner only when asked; `isKnownField("winner.place")` false by default, true in a winners context; `winnerValues` prints place/words, name, roll, team.
- [ ] **Step 2:** run — fail.
- [ ] **Step 3:** implement; widen `FIXED_FIELD` to include `winner\.(place|placeWords)` and gate it on the context flag.
- [ ] **Step 4:** run — pass. **Step 5: Commit.**

---

### Task 3: Winner recipients

**Files:** `src/lib/certificates/recipients.ts` + test, `src/lib/admin/certificate-winners.ts` (new), `src/lib/admin/certificates.ts`.

**Interfaces — Produces:**
- `winnerKey(registrationId)` → `win:<id>`; `winnerMemberKey(registrationId, member, taken)`; `winnerRollKey(rollNo | name, taken)`.
- `listWinnerStandings(eventId): Promise<WinnerStanding[]>` — service role, podium round of that event.
- `listAllRecipients` handles a `results` group; `listGroups` creates the Winners slot; `ledgerStatus`, `liveCertificateDetails` and the hub count **both** certificate types.

- [ ] **Step 1:** tests for the three key shapes, duplicate suffixes, and `win:`/`reg:` coexistence for one registration.
- [ ] **Step 2:** run — fail. **Step 3:** implement. **Step 4:** run — pass. **Step 5: Commit.**

---

### Task 4: Issue winners

**Files:** `src/lib/admin/certificate-issue.ts`, `actions.ts`.

- Reserve with `type: group.kind === "results" || group.baseKind === "winners" ? "winner" : "participation"`.
- The issue, re-issue and revoke actions check `issue:winner_certificate` for a winners group.
- A single self-addressed winner certificate gets `Congratulations — your certificate for <event>`; leader bundles keep today's wording.
- The audit row records the real type.

- [ ] **Step 1:** implement. **Step 2:** `npm run lint && npm run typecheck && npm test`. **Step 3: Commit.**

---

### Task 5: Verify shows the place

**Files:** `src/lib/certificates/verification.ts` + test, `verify-lookup.ts`.

- `VerifyRow` gains `place: string | null` (selected as `snapshot->values->>winner.place`); a valid winner shows `Winner · 1st place`, or just `Winner` without one.

- [ ] **Step 1:** test. **Step 2:** run — fail. **Step 3:** implement. **Step 4:** run — pass. **Step 5: Commit.**

---

### Task 6: Winners in the admin UI

**Files:** `GroupBar.tsx`, `ListEditor.tsx`, `SheetUpload.tsx`, `RecipientsPanel.tsx`, `page.tsx`, `actions.ts`, `globals.css`.

- Winners group: a **source** switch (From results / Uploaded list), refused while live certificates exist; the results empty state offers "Use an uploaded list instead".
- The upload's column confirm gains **Position**, stored in `certificate_groups.position_column`.
- Recipients lists live certificates with no recipient as **Issued · no longer on the list**, with Download and (with the capability) Revoke.

- [ ] **Step 1:** implement. **Step 2:** gate. **Step 3: Commit.**

---

### Task 7: Harness, gate, STATUS

- [ ] **Step 1:** add `?panel=winners` to the dev harness showing a tied 3rd place.
- [ ] **Step 2:** `npm run typecheck && npm run lint && npm test && npm run build`.
- [ ] **Step 3:** STATUS.md block with the owed walkthrough (publish results → preview a tie → issue → scan the QR → "Winner · 3rd place").
- [ ] **Step 4: Commit.**
