import { smtGroups, type ClubId, type LayerId, type Member } from "@/data/ccc";

/**
 * The same shapes ccc.ts exports, but over a members array passed in rather
 * than the module's own constant — so they work on the MERGED list, with
 * whatever has been edited in /admin/team already applied.
 *
 * Kept pure and outside React so they can be tested without rendering, and so
 * the hooks in TeamProvider stay one-liners.
 */
export const selectPresident = (members: Member[]) =>
  members.find((m) => m.layer === "president");

export const selectInLayer = (members: Member[], layer: LayerId) =>
  members.filter((m) => m.layer === layer);

export const selectClubLeaders = (members: Member[], club: ClubId) =>
  members.filter((m) => m.club === club);

/** SMT grouped by role group, empty groups dropped — as SmtCredits renders it. */
export const selectSmtByGroup = (members: Member[]) =>
  smtGroups
    .map((group) => ({ group, members: members.filter((m) => m.smtGroup === group) }))
    .filter((g) => g.members.length > 0);
