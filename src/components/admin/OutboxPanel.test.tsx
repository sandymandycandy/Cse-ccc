import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The panel imports two server actions. Nothing here presses a button — they
// are mocked only so the module graph does not drag `server-only` and the
// Supabase admin client into a render test.
vi.mock("@/app/admin/(app)/outbox/actions", () => ({
  drainBatchAction: vi.fn(),
  retryFailedAction: vi.fn(),
}));

const { OutboxPanel } = await import("./OutboxPanel");

const row = (over: Partial<Parameters<typeof OutboxPanel>[0]["recent"][0]> = {}) => ({
  id: "r1",
  toEmail: "someone@example.test",
  subject: "Council meeting moved",
  status: "sent",
  error: null,
  when: "12 Sep 2026 9:40 pm",
  ...over,
});

const panel = (over: Partial<Parameters<typeof OutboxPanel>[0]> = {}) =>
  renderToStaticMarkup(
    <OutboxPanel
      pending={0}
      failed={0}
      sentToday={0}
      canDrain
      canSeeLog
      recent={[]}
      {...over}
    />,
  );

describe("OutboxPanel", () => {
  it("keeps the three counts side by side rather than in an auto-fit column", () => {
    expect(panel({ pending: 12, failed: 2, sentToday: 84 })).toContain("outbox-tiles");
  });

  it("draws how much of the day's allowance is spent", () => {
    const html = panel({ sentToday: 250 });
    expect(html).toContain('aria-valuenow="50"');
    expect(html).toContain("width:50%");
    expect(html).toContain("250 of about 500");
  });

  // The bar going full is the explanation for a queue that stops moving, so it
  // changes colour rather than just sitting at 100%.
  it("marks the bar as full once the allowance is gone", () => {
    expect(panel({ sentToday: 500 })).toContain('data-full="true"');
    expect(panel({ sentToday: 499 })).not.toContain('data-full="true"');
  });

  it("says how many are still waiting, and stays quiet when none are", () => {
    expect(panel({ sentToday: 100, pending: 40 })).toContain("40 still waiting");
    expect(panel({ sentToday: 100, pending: 0 })).not.toContain("still waiting");
  });

  it("gives each status its own badge", () => {
    expect(panel({ recent: [row({ status: "sent" })] })).toContain("badge badge-sent");
    expect(panel({ recent: [row({ id: "r2", status: "pending" })] })).toContain(
      "badge badge-pending",
    );
    expect(panel({ recent: [row({ id: "r3", status: "failed" })] })).toContain(
      "badge badge-failed",
    );
  });

  it("puts a failure reason on its own line instead of running it into the status", () => {
    const html = panel({
      recent: [row({ status: "failed", error: "550 5.4.5 Daily user sending limit exceeded" })],
    });
    expect(html).toContain("outbox-error");
    expect(html).toContain("Daily user sending limit exceeded");
    // The old shape was `{status} — {error}` inside one cell.
    expect(html).not.toContain("failed — 550");
  });

  // ⚠️ The whole table style AND the phone card mode are scoped to
  // `table.admin` — `.tablewrap.cards table.admin { display:block }` included.
  // Without the class the header keeps the browser default centre alignment,
  // the cells lose their padding and borders, and the 720px card collapse only
  // half happens. This table shipped without it for months.
  it("carries the admin table class every other admin table has", () => {
    expect(panel({ recent: [row()] })).toContain('<table class="admin"');
  });

  // "Sep 15, 2026 9:02 PM" broke after the time and left "PM" on its own line.
  it("keeps a timestamp on one line", () => {
    expect(panel({ recent: [row()] })).toContain("outbox-when");
  });

  it("offers the drain buttons only to whoever may drain", () => {
    expect(panel({ canDrain: true, pending: 3 })).toContain("Send next batch");
    const readOnly = panel({ canDrain: false, pending: 3 });
    expect(readOnly).not.toContain("Send next batch");
    expect(readOnly).toContain("when the council presses send");
  });

  it("will not offer to send an empty queue or retry nothing", () => {
    expect(panel({ pending: 0, failed: 0 })).toContain("disabled");
  });

  /**
   * ⚠️ SECURITY. `email_log` has no club, sender or actor column, so the recent
   * list CANNOT be scoped per club — it is the last 20 rows org-wide, whoever
   * is looking. A club head holds `manage:broadcast: own`, which is enough to
   * open this page, and the list carries admin password-reset and invite
   * traffic for other people. So the addresses are shown only to someone whose
   * grant is already org-wide.
   *
   * The counts and the allowance bar stay: they are what a club head actually
   * needs here — that their queued send is draining — and they name nobody.
   */
  it("shows recipient addresses only to an org-wide admin", () => {
    const rows = [row({ toEmail: "someone.else@veltech.edu.in", subject: "Your admin invite" })];

    const council = panel({ canSeeLog: true, recent: rows });
    expect(council).toContain("someone.else@veltech.edu.in");

    const clubHead = panel({ canDrain: false, canSeeLog: false, recent: rows });
    expect(clubHead).not.toContain("someone.else@veltech.edu.in");
    expect(clubHead).not.toContain("Your admin invite");
    expect(clubHead).not.toContain("<table");
  });

  it("still tells a club head how their own queued send is doing", () => {
    const clubHead = panel({ canDrain: false, canSeeLog: false, pending: 236, sentToday: 84 });
    expect(clubHead).toContain("236");
    expect(clubHead).toContain("84 of about 500");
  });
});

/**
 * This table predates AdminTable, so it never inherited the view chips and the
 * count line every other admin list has. "Which of these failed?" was a manual
 * scan of a list that can run to hundreds of rows after a large send.
 */
describe("OutboxPanel — views and the row count", () => {
  const rows = [
    row({ id: "a", status: "sent" }),
    row({ id: "b", status: "sent" }),
    row({ id: "c", status: "pending" }),
    row({ id: "d", status: "failed", error: "Mailbox full" }),
  ];

  it("derives a chip per status the rows actually hold, plus All", () => {
    const html = panel({ recent: rows });
    for (const label of ["All", "sent", "pending", "failed"]) expect(html).toContain(label);
  });

  it("counts each view", () => {
    const html = panel({ recent: rows });
    // All 4, sent 2, pending 1, failed 1.
    expect(html).toMatch(/All[\s\S]{0,80}?>4</);
  });

  /** Just the chip row — "failed" also appears in the stat tile and the Retry button. */
  const chipRow = (html: string) =>
    html.match(/<div class="outbox-views">[\s\S]*?<\/div>\s*<p class="outbox-rows">/)?.[0] ?? "";

  it("offers no chip for a status nothing has", () => {
    // A chip that always reads zero is worse than no chip.
    const chips = chipRow(panel({ recent: [row({ status: "sent" })] }));
    expect(chips).toContain("sent");
    expect(chips).not.toContain("failed");
    expect(chips).not.toContain("pending");
  });

  it("counts the rows", () => {
    expect(panel({ recent: rows })).toContain("4 rows");
  });

  it("says row in the singular", () => {
    expect(panel({ recent: [row()] })).toContain("1 row");
  });

  it("names the timezone on the When column, as the audit log does", () => {
    expect(panel({ recent: rows })).toContain("When (IST)");
  });

  it("shows no chips at all when nothing has been sent", () => {
    expect(panel({ recent: [] })).not.toContain("outbox-views");
  });
});
