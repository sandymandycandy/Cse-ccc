"use client";

import { MotionConfig } from "motion/react";

/** Honour prefers-reduced-motion for every Motion animation on the team pages. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </MotionConfig>
  );
}
