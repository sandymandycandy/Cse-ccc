# Admin UI refresh

## Reference lock

Build target: the existing CSE Council paper design system in `docs/style-guide.html` and the authenticated admin UI. This is an incremental upgrade of that system.

Preserve warm paper/card surfaces, forest accents for navigation and actions, serif page titles, sans-serif working copy, and separate day/night tokens. Use existing Lucide icons; no bitmap assets are needed.

The Refero MCP is unavailable in this session. Research uses the existing style guide and Refero's bundled typography, color and craft-details references.

| Decision | Source | Role / reason |
| --- | --- | --- |
| Paper surfaces, forest selection and serif titles | Existing style guide | Retain the council identity; no new accent palette |
| Smaller page headings and readable secondary text | Refero typography/color | Working screens need scanning hierarchy and sufficient contrast |
| Icon navigation, a persistent workspace header, clear current location | Existing grouped navigation and role model | Improve orientation without exposing inaccessible destinations |
| Pending work first; counts and quick actions separately | Existing dashboard domain model | Distinguish tasks from context; never invent analytics |
| Visible filter reset, real empty states, focusable wide tables | Refero craft-details | Recover from filtering and support keyboard interaction |
| Mobile menu Escape handling and 44px controls | Refero craft-details | Keep navigation usable on small screens and keyboards |
| Consolidated event actions and an explicit Edit entry point | User's Events/editor request | Retain participants, attendance and results destinations while reducing table width |
| Event overview beside the editor; labelled sections and save scope | Existing five-tab form and Refero forms guidance | Keep context visible and explain that Save applies to the entire event |
| Arrow/Home/End keyboard tab navigation and linked field errors | Refero craft-details | Support keyboard and assistive technology without unmounting fields |

Reject decorative charts, fabricated activity, competing accents and changes to authorization or server mutation paths.

## Verification scope

The initial pass used code checks only. The user later authorized browser review and then narrowed it to visual design across the full admin panel. The temporary development preview was removed. No sample records were added to the database; the user's existing editor tabs were left untouched.

Passed: production build (including TypeScript), ESLint, the full 1,443-test suite, and 107 focused admin tests after the final accessibility changes. `git diff --check` is clean. No database migrations, data mutations or deployment were performed.

## Follow-up after pulling the committed refresh

`origin/main` already contains `2235056` (admin refresh, including the registration builder) and `dae2dd5` (attendance refresh). The follow-up preserves those changes and fixes:

- Garbled builder punctuation, singular item counts, card collapse during search, keyboard focus after removal/undo, and unintended form submission from the search field.
- Search results disappearing mid-rename; renaming now clears the query while preserving the expanded editor.
- Missing search clear/reset controls in attendance and session history.
- Attendance edits made during an in-flight save not scheduling their next autosave. The effect now observes the confirmed snapshot, and a timer checks whether a manual save is already in flight.

Added 11 regression tests covering complete schema submission from collapsed cards, option rows, accessible action names, reordering, undo, duplicate identity prevention, form limits and team definitions. The full suite passed with 1,483 tests before the wider visual pass.

## Full admin visual pass

Used authenticated localhost screens with real data and the existing paper design system. Reviewed all 19 sidebar destinations: Dashboard, Club health, Events, Approvals, Certificates, Announcements, Gallery, Achievements, Team, Attendance, Council, Resources, Clubs, Contact, Feedback, Email, Outbox, Admins and Audit. Also inspected event editing, participants, registrations and results; content creation forms; and attendance/council analytics and member screens. Mobile screenshots used a 390px viewport. This is a visual audit, not a claim that every role, record or interaction was exercised.

Changes grounded in observed screenshots:

- Normalize headings on pages outside the shared header wrapper; align header actions and give toolbars breathing room above tables.
- Separate statistic values, labels and hints; keep the odd attendance tile aligned across the mobile row.
- Fix Team profile grids growing wider than the phone screen, including file-input intrinsic sizing.
- Give content and member forms consistent surfaces, input styling and mobile spacing.
- Improve gallery caption readability with two-line titles and aligned edit links.
- Bring Council meeting creation into the shared panel style and load attendance styles for Council analytics on direct visits.
- Align participant search with the other roster toolbars and enlarge results inputs.
- Clarify that event edits apply when Save changes is selected, with notification copy matching the existing action.

After the user signed in again, the remaining visual recheck was completed at desktop and 390px mobile widths. Verified the gallery with loaded photos, content/member forms, Council analytics, participant search, results, event editor and registration builder. Rechecked the mobile dashboard, event list and Team page; no page-level horizontal overflow was observed on these screens. Fixed the Results new-round field/button wrapping found in this pass, and matched horizontal scrollbars to the workspace theme. Wide result tables and event tabs retain intentional internal scrolling. Browser viewport overrides were reset afterward.

No live mutation buttons were used; temporary form-builder edits from the earlier interaction check were discarded before the user narrowed the review to design only.

Code validation after the wider pass: all 1,483 tests in 125 files passed, ESLint passed, TypeScript passed, and the production build generated all 62 pages. No production records were changed and nothing was committed, pushed or deployed.

## Screenshot follow-up: event labels, attendance and Team

Reference lock: the user's September 23 Events screenshot identifies the unlabeled actions; the September 22 Attendance and Team screenshots define the compact creation panel, session history rows, turnout bars, grouped profile rows and saved-record filters. These extend the existing paper/forest tokens. Reference names, counts and percentages are not seeded as data.

- Events now shows Participants, Attendance and Results labels at desktop widths as well as mobile, with wrapping to keep the actions readable.
- Club and Council session creation use the same responsive field grid. Their history uses compact rows with actual turnout, date/slot, status and a named Open link. Date sorting remains available, and Council inline renaming is preserved.
- Team has name/role/team/email search, All/Saved/Unsaved counts and collapsible profile editors grouped by the existing leadership layers. Filtering hides mounted editors, preserving unsaved input. The optional sync notice appears below the toolbar.
- Explicit club closure converts every unmarked approved, active roster member to an absent mark. Submitted edits take precedence; omitted saved marks survive. Saving a draft retains the tri-state model. Previously closed records are not retroactively rewritten.
- Council continues using its presence-row model: everyone outside the submitted present set is absent when closed. Its close copy states this, and closed rosters are read-only until reopened. Both close actions scope input to the authorised roster, reject writes to already closed sessions and stop on database failures.

Validation: all 1,495 tests in 126 files passed, including 11 new close/draft/authorization/failure regression tests and Council history routing coverage. ESLint, TypeScript, production build (62 pages) and diff checks passed. The final Team toolbar/sync ordering adjustment also passed TypeScript. No live save, close, mark, sync or rename buttons were exercised.

After the user renewed the localhost sign-in, the screenshot-driven layouts were visually checked with real data on desktop and at 390px: Events, club attendance, Council attendance/history, a closed Council roster, and Team including an expanded profile editor. Fixed the uneven event-action wrap with a two-column grid, the Team/Council search-icon positioning, inherited extra Team panel padding, oversized Team section headings, and dark-mode date/time icon contrast. No document-level horizontal overflow was observed on the checked mobile pages. Temporary viewport overrides were reset. TypeScript, focused ESLint and diff checks passed after these visual repairs. No live mutation buttons, database migrations, production writes or deployment were performed.

## Email and Audit follow-up

Reference lock: preserve the workspace's paper/forest colors, section panels and compact attendance-history rows. The initial authenticated screenshots showed Email constrained to a narrow single column with the message fields below seven audience choices, and Audit spilling six columns beyond its visible container. Refero's bundled forms/focus guidance informed the labelled sections, keyboard focus and mobile controls.

| Decision | Evidence / purpose |
| --- | --- |
| Separate audience and message panels on desktop; stacked panels on mobile | Make the editor visible beside recipient selection while preserving the existing form and send flow |
| Outbox header link and short queue explanation | Keep delivery context visible without technical copy dominating the page |
| Readable action/area labels and activity rows | Replace the wide Audit table; keep people, action and IST timestamp easy to scan |
| Expandable summary, record ID, audit ID and IP | Retain every existing audit field without making technical details dominate each row |
| Search, action/area filters and 20-record pages | Navigate the same latest 100 records locally, preserving server authorization and chronological order |

Verified Email and Audit on desktop and at 390px with actual records, including the expanded audit-detail layout. No document overflow was observed, and viewport overrides were reset. No emails were sent or queued and no live mutation controls were used. Four Audit regression tests cover combined filters, identifiers/time search, page size/detail availability and empty history; all 33 focused Audit/composer tests passed. TypeScript, focused ESLint, production build (62 pages), and diff checks passed. Sending actions, recipient authorization, audit data queries and production records remain unchanged.
