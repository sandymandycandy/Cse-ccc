"use client";

import { IssuePanel } from "./IssuePanel";

/**
 * Dev harness for the Issue tab: the real panel with sample counts, so the
 * buttons, the replace-outdated confirm and the progress bar can be seen
 * without an admin login. The actions behind them need a real session and will
 * refuse. Sample data only — never a real person.
 */
export function IssueHarness() {
  return (
    <IssuePanel
      eventId="00000000-0000-4000-8000-000000000000"
      groupId="00000000-0000-4000-8000-000000000001"
      groupName="Participants"
      counts={{ total: 24, issued: 18, revoked: 1, pendingEmail: 4, noEmail: 1 }}
      outdated={{ total: 3, withEmail: 2 }}
      hasTemplate
    />
  );
}
