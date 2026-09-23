import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), event: vi.fn(), manage: vi.fn(), schema: vi.fn(),
  row: vi.fn(), write: vi.fn(), audit: vi.fn(), update: vi.fn(),
}));
vi.mock("@/lib/auth/guards", () => ({ getAdminSession: mocks.session }));
vi.mock("@/lib/admin/event-hosts", () => ({ canManageEvent: mocks.manage }));
vi.mock("@/lib/admin/attendance", () => ({ getEventForAttendance: mocks.event }));
vi.mock("@/lib/admin/registrations", () => ({ getEventFormSchema: mocks.schema }));
vi.mock("@/lib/admin/registration-attendance", () => ({
  getRegistrationForMarking: mocks.row, writeRegistrationAttendance: mocks.write,
}));
vi.mock("@/lib/admin/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/email", () => ({ enqueueEmail: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`redirect:${u}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      // toggleAttendanceAction reads shortlisted_at before marking present…
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { shortlisted_at: null } }) }) }) }),
      // …then writes the row.
      update: (v: unknown) => { mocks.update(v); return { eq: () => ({ eq: async () => ({ error: null }) }) }; },
    }),
  }),
}));

import { setMemberAttendanceAction, toggleAttendanceAction } from "@/app/admin/(app)/events/[id]/registrations/actions";

const eventId = "10000000-0000-4000-8000-000000000001";
const registrationId = "10000000-0000-4000-8000-000000000002";
const teamSchema = [{ id: "team", kind: "team", label: "Team", maxMembers: 3, members: [{ key: "n", kind: "short_text", label: "Name" }] }];
const row = (over = {}) => ({
  name: "Leader", roll: "L1", department: null, year: null, email: "l@x.in", phone: null, teamName: "Owls",
  customAnswers: { team: [{ n: "Asha" }, { n: "Ravi" }] }, attended: true, absent: [], shortlistedAt: null, ...over,
});
const call = (position: number, present: boolean) => setMemberAttendanceAction({ eventId, registrationId, position, present });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ id: "admin" });
  mocks.event.mockResolvedValue({ hosts: [] });
  mocks.manage.mockReturnValue(true);
  mocks.schema.mockResolvedValue({ schema: teamSchema, selectionMode: "seats" });
  mocks.row.mockResolvedValue(row());
});

describe("per-person attendance action", () => {
  it("marks one member absent on an attended team and audits it", async () => {
    await expect(call(2, false)).resolves.toEqual({ ok: true, attended: true, absent: [2] });
    expect(mocks.write).toHaveBeenCalledWith({ eventId, registrationId, attended: true, absent: [2], actorId: "admin", stampCheckIn: false });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "attend_member", entity: "registration", entityId: registrationId,
      after: { position: 2, name: "Ravi", present: false },
    }));
  });

  it("attends an unmarked team and stamps the check-in", async () => {
    mocks.row.mockResolvedValue(row({ attended: false }));
    await expect(call(1, false)).resolves.toEqual({ ok: true, attended: true, absent: [1] });
    expect(mocks.write).toHaveBeenCalledWith(expect.objectContaining({ attended: true, stampCheckIn: true }));
  });

  it("rejects a position outside the team without writing", async () => {
    await expect(call(3, false)).resolves.toEqual({ ok: false, error: expect.any(String) });
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("refuses an unshortlisted row on a shortlist event", async () => {
    mocks.schema.mockResolvedValue({ schema: teamSchema, selectionMode: "shortlist" });
    await expect(call(0, true)).resolves.toMatchObject({ ok: false });
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("refuses a viewer who cannot manage the event", async () => {
    mocks.manage.mockReturnValue(false);
    await expect(call(0, true)).resolves.toMatchObject({ ok: false });
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("marking the full team present clears absentees", async () => {
    const f = new FormData();
    f.set("registrationId", registrationId); f.set("eventId", eventId); f.set("attend", "1");
    await toggleAttendanceAction(f);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ attended: true, absent_members: [] }));
  });
});
