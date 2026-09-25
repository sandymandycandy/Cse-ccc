import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ getAdminSession: async () => ({ id: "admin-1" }) }));
vi.mock("@/lib/admin/event-hosts", () => ({ canManageEvent: () => true }));
vi.mock("@/lib/admin/attendance", () => ({ getEventForAttendance: async () => ({ title: "Expo", hosts: {} }) }));
vi.mock("@/lib/admin/registrations", () => ({
  getEventFormSchema: async () => ({ schema: [], selectionMode: "shortlist" }),
}));
vi.mock("@/lib/registration-form/recipients", () => ({
  teamRecipients: (_s: unknown, _a: unknown, email: string | null) => (email ? [email] : []),
}));
const writeAudit = vi.fn();
vi.mock("@/lib/admin/audit", () => ({ writeAudit: (e: unknown) => writeAudit(e) }));
const enqueueEmail = vi.fn();
vi.mock("@/lib/email", () => ({
  enqueueEmail: (m: unknown) => enqueueEmail(m),
  enqueueEmailBatch: vi.fn(),
}));

// A recording fake of the two update chains finalise uses: the claim
// (update→eq→eq→is→select) and the revert (update→eq→in).
const updates: { values: unknown; ids?: string[] }[] = [];
const claimed = [
  { id: "t1", email: "a@x.in", student_name: "A", custom_answers: null },
  { id: "t2", email: "b@x.in", student_name: "B", custom_answers: null },
  { id: "t3", email: "c@x.in", student_name: "C", custom_answers: null },
];
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      // setShortlistDecisionAction reads the current category before patching.
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { shortlist_decision: "waitlist" }, error: null }) }) }) }),
      update: (values: unknown) => {
        const rec: { values: unknown; ids?: string[] } = { values };
        updates.push(rec);
        const chain = {
          eq: () => chain,
          is: () => chain,
          select: async () => ({ data: claimed, error: null }),
          in: async (_col: string, ids: string[]) => {
            rec.ids = ids;
            return { error: null };
          },
        };
        return chain;
      },
    }),
  }),
}));

const { finaliseShortlistAction, setShortlistDecisionAction } = await import("./actions");
const EVENT = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  updates.length = 0;
});

describe("finaliseShortlistAction", () => {
  it("emails every claimed team", async () => {
    const res = await finaliseShortlistAction({ eventId: EVENT });
    expect(res).toEqual({ ok: true, teams: 3, recipients: 3, queued: false });
    expect(enqueueEmail).toHaveBeenCalledTimes(3);
    expect(updates).toHaveLength(1); // the claim only — nothing reverted
  });

  it("un-claims the teams it could not email, so a retry sends them", async () => {
    enqueueEmail.mockImplementation(async (m: { toEmail: string }) => {
      if (m.toEmail === "b@x.in") throw new Error("email_log insert failed");
    });
    const res = await finaliseShortlistAction({ eventId: EVENT });
    expect(res.ok).toBe(false);
    expect(updates).toHaveLength(2);
    expect(updates[1]).toEqual({ values: { shortlisted_at: null }, ids: ["t2", "t3"] });
  });
});

describe("setShortlistDecisionAction", () => {
  it("audits the category it replaced as well as the new one", async () => {
    const res = await setShortlistDecisionAction({
      eventId: EVENT, registrationId: "00000000-0000-4000-8000-000000000002", decision: "shortlist",
    });
    expect(res).toEqual({ ok: true });
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "shortlist_decision", before: { decision: "waitlist" }, after: { decision: "shortlist" },
    }));
  });
});
