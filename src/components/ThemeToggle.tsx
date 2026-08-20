"use client";

import { useState } from "react";

/**
 * Night-paper toggle. The current theme is resolved server-side (from a cookie
 * in layout.tsx) and passed in as `initialTheme`, so the icon renders correctly
 * on the server and hydrates without a mismatch — no effect, no flash. Clicking
 * flips data-theme on <html> and persists the choice in the cookie.
 */
export function ThemeToggle({
  initialTheme = "day",
}: {
  initialTheme?: "day" | "night";
}) {
  const [theme, setTheme] = useState<"day" | "night">(initialTheme);

  function toggle() {
    const next = theme === "night" ? "day" : "night";
    document.documentElement.setAttribute("data-theme", next);
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
    setTheme(next);
  }

  const isNight = theme === "night";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isNight}
      title={isNight ? "Switch to day paper" : "Switch to night paper"}
      aria-label={isNight ? "Switch to day paper" : "Switch to night paper"}
      className="grid place-items-center w-[42px] h-[42px] rounded-[12px] border border-line-3 text-ink bg-transparent cursor-pointer"
    >
      <span aria-hidden>{isNight ? "◑" : "◐"}</span>
    </button>
  );
}
