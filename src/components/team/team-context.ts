"use client";

import { createContext, useCallback, useContext, useMemo } from "react";

import { coverPosition, type ClubId, type LayerId, type Member } from "@/data/ccc";
import { coverPositionFrom } from "@/lib/team/framing";
import type { TeamPhoto } from "@/lib/team/profiles";
import { selectClubLeaders, selectInLayer, selectPresident, selectSmtByGroup } from "@/lib/team/selectors";

/*
 * The team page's context and hooks, deliberately in their own module that
 * imports NO components.
 *
 * TeamProvider.tsx renders ProfileDrawer, and ProfileDrawer (and MemberPortrait,
 * through Portrait) read these hooks. If the hooks lived in TeamProvider.tsx
 * that would be an import cycle — TeamProvider → ProfileDrawer → TeamProvider.
 * Keep this file free of component imports so the cycle cannot come back.
 */

export type TeamContext = {
  openProfile: (id: string) => void;
  club: ClubId;
  /** Select a club in the Clubs section; optionally scroll it into view. */
  showClub: (id: ClubId, scroll?: boolean) => void;
  /** The 46 from src/data/ccc.ts with their /admin/team edits already applied. */
  members: Member[];
  /** Uploaded portraits by member id. Absent = use the bundled import. */
  photos: Record<string, TeamPhoto>;
};

export const Ctx = createContext<TeamContext | null>(null);

export function useTeam() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTeam must be used inside <TeamProvider>");
  return ctx;
}

/*
 * Member data comes from here, never from a module import of @/data/ccc — a
 * module import is evaluated once, before React runs, and can only ever see the
 * file's values, not what has been edited in /admin/team.
 *
 * Each selector hook is memoised on `members`: filter() returns a new array
 * every call, which would silently re-run any useMemo a consumer builds on top.
 */
export const useMembers = () => useTeam().members;

export function useMember(id: string) {
  const members = useMembers();
  return useMemo(() => members.find((m) => m.id === id), [members, id]);
}

export function useMembersInLayer(layer: LayerId) {
  const members = useMembers();
  return useMemo(() => selectInLayer(members, layer), [members, layer]);
}

export function useClubLeaders(club: ClubId) {
  const members = useMembers();
  return useMemo(() => selectClubLeaders(members, club), [members, club]);
}

export function usePresident() {
  const members = useMembers();
  // The roster always has a president; ccc.ts asserts the same with `!`.
  return useMemo(() => selectPresident(members)!, [members]);
}

export function useSmtByGroup() {
  const members = useMembers();
  return useMemo(() => selectSmtByGroup(members), [members]);
}

export const usePhoto = (member: Member): TeamPhoto | undefined => useTeam().photos[member.id];

/**
 * Returns a crop function rather than a crop, because most call sites run
 * inside .map() — where a hook cannot be called.
 *
 * ⚠️ Prefers an UPLOADED portrait's own size and focal point. Calling ccc.ts's
 * coverPosition() directly would crop an uploaded photo using the OLD bundled
 * photo's focal point and aspect ratio — a different image entirely.
 */
export function useCoverPosition() {
  const { photos } = useTeam();
  return useCallback(
    (member: Member, containerAspect: number, headroom = 4) => {
      const uploaded = photos[member.id];
      return uploaded
        ? coverPositionFrom(uploaded, containerAspect, headroom)
        : coverPosition(member, containerAspect, headroom);
    },
    [photos],
  );
}
