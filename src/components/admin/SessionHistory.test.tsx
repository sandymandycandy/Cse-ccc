import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionHistory } from "./SessionHistory";

type Row = Parameters<typeof SessionHistory>[0]["sessions"][0];

const row = (over: Partial<Row> = {}): Row => ({
  id: "s1",
  title: "Weekly sync",
  status: "closed",
  openedAt: "2026-09-01T04:00:00.000Z",
  sessionDate: "2026-09-01",
  startTime: "09:15:00",
  endTime: "10:30:00",
  presentCount: 8,
  ...over,
});

const history = (sessions: Row[], strength = 10) =>
  renderToStaticMarkup(<SessionHistory sessions={sessions} strength={strength} />);

describe("SessionHistory", () => {
  it("offers the shared toolbar, not a bare search box", () => {
    const html = history([row()]);
    expect(html).toContain("listbar");
    expect(html).toContain("view-chips");
    expect(html).toContain("count-note");
    // The old hand-rolled input this replaced.
    expect(html).not.toContain('class="search-input"');
  });

  it("derives a chip per status that is actually present", () => {
    // Scoped to the chip markup on purpose: every row also carries an "Open"
    // LINK to the session, so a bare search for "Open" passes either way.
    const chip = (label: string) => new RegExp(`class="view-chip"[^>]*>${label}<span>`);

    const both = history([row({ id: "a", status: "open" }), row({ id: "b", status: "closed" })]);
    expect(both).toMatch(chip("Open"));
    expect(both).toMatch(chip("Closed"));

    // A status nobody carries gets no chip that would always read zero.
    const closedOnly = history([row({ id: "b", status: "closed" })]);
    expect(closedOnly).toMatch(chip("Closed"));
    expect(closedOnly).not.toMatch(chip("Open"));
  });

  it("keeps the newest-first sort toggle the shared table cannot offer", () => {
    const html = history([row()]);
    expect(html).toContain('aria-label="Sorted newest first — sort oldest first"');
    expect(html).toContain("Newest first");
  });

  it("counts sessions by name, not as generic rows", () => {
    expect(history([row({ id: "a" }), row({ id: "b" })])).toContain("2 sessions");
    expect(history([row()])).toContain("1 session");
  });

  it("shows a real empty state instead of a bare sentence", () => {
    const html = history([]);
    expect(html).toContain("table-empty");
    expect(html).toContain("No sessions yet");
  });

  it("reports turnout against club strength, not the marked count", () => {
    expect(history([row({ presentCount: 5 })], 10)).toContain("50%");
  });

  it("survives a session with no slot", () => {
    expect(history([row({ startTime: null, endTime: null })])).toContain("—");
  });

  it("routes Council history to Council meetings and retains rename", () => {
    const html = renderToStaticMarkup(<SessionHistory sessions={[row()]} strength={10} scope="council" onRename={async () => ({ ok: true })} />);
    expect(html).toContain('href="/admin/council/sessions/s1"');
    expect(html).toContain("1 meeting");
    expect(html).toContain('aria-label="Rename Weekly sync"');
    expect(html).not.toContain('/admin/attendance/sessions/');
  });
});
