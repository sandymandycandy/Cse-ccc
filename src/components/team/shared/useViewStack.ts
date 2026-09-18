"use client";

import { useCallback, useState } from "react";

import { contextOf, getMember } from "@/data/ccc";

export type View = { type: "member"; id: string };

/**
 * The open profile. Member views can step through their context
 * (same club, otherwise same layer).
 *
 * ⚠️ This deliberately uses the STATIC getMember/contextOf from @/data/ccc,
 * unlike every other team component, and that is correct: stepping only needs
 * each member's id, club and layer — pure structure, which mergeProfiles never
 * changes (pinned by a test in src/lib/team/profiles.test.ts). So the file and
 * the merged list navigate identically. The drawer renders the member it lands
 * on through useMember(id), which IS merged.
 *
 * Do not "fix" this to read from context: TeamProvider calls this hook BEFORE
 * its own context value exists, so useTeam() here would throw.
 */
export function useViewStack() {
  const [current, setCurrent] = useState<View | null>(null);

  const open = useCallback((view: View) => setCurrent(view), []);
  const close = useCallback(() => setCurrent(null), []);

  const step = useCallback((delta: number) => {
    setCurrent((view) => {
      const member = view && getMember(view.id);
      if (!member) return view;
      const ctx = contextOf(member);
      const i = ctx.findIndex((m) => m.id === member.id);
      return { type: "member", id: ctx[(i + delta + ctx.length) % ctx.length].id };
    });
  }, []);

  return { current, open, close, step };
}

export type ViewStack = ReturnType<typeof useViewStack>;
