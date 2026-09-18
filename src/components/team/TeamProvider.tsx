"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";

import type { ClubId } from "@/data/ccc";
import { ProfileDrawer } from "./ProfileDrawer";
import { useViewStack } from "./shared/useViewStack";

type TeamContext = {
  openProfile: (id: string) => void;
  club: ClubId;
  /** Select a club in the Clubs section; optionally scroll it into view. */
  showClub: (id: ClubId, scroll?: boolean) => void;
};

const Ctx = createContext<TeamContext | null>(null);

export function useTeam() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTeam must be used inside <TeamProvider>");
  return ctx;
}

export function TeamProvider({ children }: { children: React.ReactNode }) {
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
    () => ({ openProfile: (id) => open({ type: "member", id }), club, showClub }),
    [open, club, showClub],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <AnimatePresence>{views.current && <ProfileDrawer key="profile" views={views} onShowClub={showClub} />}</AnimatePresence>
    </Ctx.Provider>
  );
}
