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

The user requested code checks only for the final implementation. The temporary development preview was removed. No sample records were added to the database. Authenticated browser validation of the updated event editor remains unperformed; the existing production tab had unsaved changes and was left untouched.

Passed: production build (including TypeScript), ESLint, the full 1,443-test suite, and 107 focused admin tests after the final accessibility changes. `git diff --check` is clean. No database migrations, data mutations or deployment were performed.
