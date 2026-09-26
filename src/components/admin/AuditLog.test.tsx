import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AuditLog, filterAuditEntries } from "./AuditLog";
import type { AuditEntry } from "@/lib/admin/queries";

const entry = (overrides: Partial<AuditEntry> = {}): AuditEntry => ({
  id: "audit-1", at: "2026-09-23T12:00:00Z", actor: "Admin One", action: "close",
  entity: "club_attendance_session", entityId: "record-123456789", target: null, ip: "127.0.0.1",
  changes: [{ field: "present", label: "Present", kind: "set", from: null, to: "9" }],
  ...overrides,
});

describe("audit activity", () => {
  it("combines query, action and area filters while preserving newest-first order", () => {
    const rows = [entry(), entry({ id: "audit-2", action: "open" }), entry({ id: "audit-3", entity: "event" }), entry({ id: "audit-4" })];
    expect(filterAuditEntries(rows, "Admin", "close", "club_attendance_session").map((r) => r.id)).toEqual(["audit-1", "audit-4"]);
    expect(filterAuditEntries(rows, "missing", "", "")).toEqual([]);
  });

  it("finds full record IDs, IP addresses, readable areas and IST times", () => {
    for (const query of ["record-123456789", "127.0.0.1", "club attendance session", "5:30 PM", "23/09/2026"]) {
      expect(filterAuditEntries([entry()], query, "", "")).toHaveLength(1);
    }
    expect(filterAuditEntries([entry({ actor: null })], "System", "", "")).toHaveLength(1);
  });

  it("keeps technical details available and renders only the first page", () => {
    const rows = Array.from({ length: 21 }, (_, i) => entry({ id: `audit-${i}`, actor: `Person ${i}` }));
    const html = renderToStaticMarkup(<AuditLog entries={rows} />);
    expect(html).toContain("Showing 1–20 of 21");
    expect(html).toContain("Person 19");
    expect(html).not.toContain("Person 20");
    expect(html).toContain("record-123456789");
    expect(html).toContain("127.0.0.1");
    expect(html).toContain("Present");
  });

  it("shows what changed from → to, and finds entries by those values", () => {
    const venue = entry({
      entity: "event", target: "AI Forge Expo",
      changes: [{ field: "venue_text", label: "Venue", kind: "changed", from: "Hall A", to: "Lab 3" }],
    });
    const html = renderToStaticMarkup(<AuditLog entries={[venue]} />);
    expect(html).toContain("AI Forge Expo");
    expect(html).toMatch(/Hall A.*→.*Lab 3/);
    expect(filterAuditEntries([venue], "lab 3", "", "")).toHaveLength(1);
    expect(filterAuditEntries([venue], "ai forge", "", "")).toHaveLength(1);
  });

  it("shows a truthful empty history", () => {
    const html = renderToStaticMarkup(<AuditLog entries={[]} />);
    expect(html).toContain("No activity recorded yet");
    expect(html).not.toContain("Showing 1");
  });
});
