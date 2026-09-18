"use client";

import { useCallback, useState } from "react";

import { contextOf, getMember } from "@/data/ccc";

export type View = { type: "member"; id: string };

/**
 * The open profile. Member views can step through their context
 * (same club, otherwise same layer).
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
