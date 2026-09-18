"use client";

import { useCallback, useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";

import type { ClubId, Member } from "@/data/ccc";
import type { TeamPhoto } from "@/lib/team/profiles";
import { ProfileDrawer } from "./ProfileDrawer";
import { useViewStack } from "./shared/useViewStack";
import { Ctx, type TeamContext } from "./team-context";

/**
 * Supplies the merged team data and the open-profile state to the page.
 *
 * The hooks that READ this live in ./team-context, not here: this file renders
 * ProfileDrawer, so hooks defined here would put ProfileDrawer in an import
 * cycle with the provider that renders it.
 */
export function TeamProvider({
  members,
  photos,
  children,
}: {
  members: Member[];
  photos: Record<string, TeamPhoto>;
  children: React.ReactNode;
}) {
  const views = useViewStack();
  const [club, setClub] = useState<ClubId>("coding");
  const { open } = views;

  const showClub = useCallback((id: ClubId, scroll = false) => {
    setClub(id);
    if (scroll) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.getElementById("clubs")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  }, []);

  const value = useMemo<TeamContext>(
    () => ({ openProfile: (id) => open({ type: "member", id }), club, showClub, members, photos }),
    [open, club, showClub, members, photos],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <AnimatePresence>{views.current && <ProfileDrawer key="profile" views={views} onShowClub={showClub} />}</AnimatePresence>
    </Ctx.Provider>
  );
}
