"use client";

import { RecipientsPanel, type RecipientRow } from "./RecipientsPanel";

/**
 * Dev harness for the Recipients tab: the real panel with sample people, so
 * the table, search, filters and row states can be exercised without an admin
 * login. The actions behind the buttons need a real session and will refuse.
 * Sample data only — never a real person.
 */

const GROUPS = [
  { id: "g-participants", name: "Participants" },
  { id: "g-volunteers", name: "Volunteers" },
];

const ROWS: RecipientRow[] = [
  {
    key: "reg:1",
    groupId: "g-participants",
    groupName: "Participation",
    kind: "registration",
    name: "Asha R",
    roll: "vtu27001",
    teamLabel: "Byte Me",
    email: "asha@example.edu",
    deliverTo: "asha@example.edu",
    viaLeader: false,
    warnings: [],
    status: { state: "issued", certificateId: "c1", serial: "CSE-2026-1A2B", issuedAt: "2026-09-14T06:00:00Z" },
    filename: "Certificate - Asha R - Hack Night.pdf",
  },
  {
    key: "reg:1:m:vtu1002",
    groupId: "g-participants",
    groupName: "Participation",
    kind: "member",
    name: "Ravi K",
    roll: "vtu27002",
    teamLabel: "Byte Me",
    email: null,
    deliverTo: "asha@example.edu",
    viaLeader: true,
    warnings: ["Department is empty"],
    status: { state: "pending" },
    filename: "Certificate - Ravi K - Hack Night.pdf",
  },
  {
    key: "reg:2",
    groupId: "g-participants",
    groupName: "Participation",
    kind: "registration",
    name: "Venkata Satya Sai Krishna Prasad Reddy",
    roll: "vtu27003",
    teamLabel: null,
    email: "venkata@example.edu",
    deliverTo: "venkata@example.edu",
    viaLeader: false,
    warnings: [`"Name" doesn't fit its box`],
    status: { state: "pending" },
    filename: "Certificate - Venkata - Hack Night.pdf",
  },
  {
    key: "reg:3",
    groupId: "g-participants",
    groupName: "Participation",
    kind: "registration",
    name: "Kim P",
    roll: "vtu27004",
    teamLabel: null,
    email: null,
    deliverTo: null,
    viaLeader: false,
    warnings: [],
    status: { state: "revoked", revokedAt: "2026-09-14T07:00:00Z" },
    filename: "Certificate - Kim P - Hack Night.pdf",
  },
  {
    key: "sheet:g-volunteers:priya@example.edu",
    groupId: "g-volunteers",
    groupName: "Volunteers",
    kind: "sheet",
    name: "Priya S",
    roll: "",
    teamLabel: null,
    email: "priya@example.edu",
    deliverTo: "priya@example.edu",
    viaLeader: false,
    warnings: ["Font can't print: ॐ"],
    status: { state: "issued", certificateId: "c2", serial: "CSE-2026-9Z8Y", issuedAt: "2026-09-14T06:30:00Z" },
    filename: "Certificate - Priya S - Hack Night.pdf",
  },
  {
    key: "sheet:g-volunteers:rahul t",
    groupId: "g-volunteers",
    groupName: "Volunteers",
    kind: "sheet",
    name: "Rahul T",
    roll: "",
    teamLabel: null,
    email: null,
    deliverTo: null,
    viaLeader: false,
    warnings: [],
    status: { state: "pending" },
    filename: "Certificate - Rahul T - Hack Night.pdf",
  },
];

export function RecipientsHarness() {
  return (
    <RecipientsPanel eventId="00000000-0000-4000-8000-000000000000" rows={ROWS} groups={GROUPS} canRevoke />
  );
}
