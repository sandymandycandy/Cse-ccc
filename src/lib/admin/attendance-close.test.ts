import { beforeEach, describe, expect, it, vi } from "vitest";
import { finaliseMarks } from "./attendance-marks";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), permission: vi.fn(), detail: vi.fn(), councilDetail: vi.fn(),
  save: vi.fn(), councilSave: vi.fn(), close: vi.fn(), councilClose: vi.fn(), audit: vi.fn(),
}));
vi.mock("@/lib/auth/guards", () => ({ getAdminSession: mocks.session }));
vi.mock("@/lib/auth/capabilities", () => ({ canManage: mocks.permission }));
vi.mock("@/lib/admin/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => { throw new Error("No live database in this test"); } }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/attendance-club", () => ({
  createSession: vi.fn(), getSessionMarking: mocks.detail, saveMarks: mocks.save, setSessionStatus: mocks.close,
}));
vi.mock("@/lib/admin/attendance-council", () => ({
  createSession: vi.fn(), getSessionMarking: mocks.councilDetail, savePresence: mocks.councilSave,
  setSessionStatus: mocks.councilClose, getMemberForEdit: vi.fn(), rotateJoinToken: vi.fn(),
}));

import { saveAndCloseAction as closeClub, saveAttendanceAction as draftClub } from "@/app/admin/(app)/attendance/actions";
import { saveAndCloseAction as closeCouncil } from "@/app/admin/(app)/council/actions";

const sessionId = "10000000-0000-4000-8000-000000000000";
const ids = [1, 2, 3, 4].map((n) => `20000000-0000-4000-8000-00000000000${n}`);
const roster = [
  { memberId: ids[0], mark: "present" as const },
  { memberId: ids[1], mark: null },
  { memberId: ids[2], mark: "absent" as const },
];
const form = () => { const f = new FormData(); f.set("sessionId", sessionId); return f; };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ id: "admin" });
  mocks.permission.mockReturnValue(true);
  mocks.detail.mockResolvedValue({ session: { status: "open", clubId: "club" }, roster });
  mocks.councilDetail.mockResolvedValue({ session: { status: "open" }, roster: roster.map((r) => ({ memberId: r.memberId, present: r.mark === "present" })) });
});

describe("finalise attendance", () => {
  it("preserves omitted saved marks and marks every unmarked roster member absent", () => {
    expect([...finaliseMarks(roster, new Map())]).toEqual([[ids[0], "present"], [ids[1], "absent"], [ids[2], "absent"]]);
  });

  it("applies current edits, resolves an explicit reset to absent and excludes outsiders", () => {
    const result = finaliseMarks(roster, new Map([[ids[0], null], [ids[1], "present"], [ids[3], "present"]]));
    expect([...result]).toEqual([[ids[0], "absent"], [ids[1], "present"], [ids[2], "absent"]]);
  });

  it("persists absent marks before closing the club session", async () => {
    const f = form(); f.append("unmarked", ids[1]); f.append("present", ids[3]);
    await expect(closeClub(f)).rejects.toThrow("?closed=1");
    expect(mocks.save).toHaveBeenCalledWith(sessionId, new Map([[ids[0], "present"], [ids[1], "absent"], [ids[2], "absent"]]), "admin");
    expect(mocks.close).toHaveBeenCalledWith(sessionId, "closed");
    expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(mocks.close.mock.invocationCallOrder[0]);
  });

  it("keeps unmarked members unmarked when saving a draft", async () => {
    const f = form(); f.append("unmarked", ids[1]);
    await expect(draftClub(f)).rejects.toThrow("?saved=1");
    expect(mocks.save).toHaveBeenCalledWith(sessionId, new Map([[ids[1], null]]), "admin");
    expect(mocks.close).not.toHaveBeenCalled();
  });

  it("finalises Council presence so everyone else is absent, excluding duplicate and outsider ids", async () => {
    const f = form(); f.append("present", ids[0]); f.append("present", ids[0]); f.append("present", ids[3]);
    await expect(closeCouncil(f)).rejects.toThrow("?closed=1");
    expect(mocks.councilSave).toHaveBeenCalledWith(sessionId, [ids[0]], "admin");
    expect(mocks.councilClose).toHaveBeenCalledWith(sessionId, "closed");
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ after: { present: 1, absent: 2, closed: true } }));
  });

  for (const scope of ["club", "council"] as const) {
    const action = scope === "club" ? closeClub : closeCouncil;
    it(`does not close ${scope} if saving marks fails`, async () => {
      const save = scope === "club" ? mocks.save : mocks.councilSave;
      save.mockRejectedValueOnce(new Error("write failed"));
      await expect(action(form())).rejects.toThrow("write failed");
      expect(mocks.close).not.toHaveBeenCalled();
      expect(mocks.councilClose).not.toHaveBeenCalled();
      expect(mocks.audit).not.toHaveBeenCalled();
    });

    it(`rejects unauthorised ${scope} closure`, async () => {
      mocks.permission.mockReturnValue(false);
      await expect(action(form())).rejects.toThrow("redirect:");
      expect(mocks.save).not.toHaveBeenCalled();
      expect(mocks.councilSave).not.toHaveBeenCalled();
    });

    it(`does not rewrite an already closed ${scope} session`, async () => {
      (scope === "club" ? mocks.detail : mocks.councilDetail).mockResolvedValueOnce({ session: { status: "closed", clubId: "club" }, roster });
      await expect(action(form())).rejects.toThrow("redirect:");
      expect(mocks.save).not.toHaveBeenCalled();
      expect(mocks.councilSave).not.toHaveBeenCalled();
    });
  }
});
