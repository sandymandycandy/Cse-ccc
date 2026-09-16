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

  it("offers the drain buttons only to whoever may drain", () => {
    expect(panel({ canDrain: true, pending: 3 })).toContain("Send next batch");
    const readOnly = panel({ canDrain: false, pending: 3 });
    expect(readOnly).not.toContain("Send next batch");
    expect(readOnly).toContain("when the council presses send");
  });

  it("will not offer to send an empty queue or retry nothing", () => {
    expect(panel({ pending: 0, failed: 0 })).toContain("disabled");
  });
});
