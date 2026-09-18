"use client";

import { createPortal } from "react-dom";

/**
 * Renders dialogs at the end of <body> so they escape any page-level stacking
 * context (isolate, transforms) and always sit above the concept switcher.
 * Pass the concept's font variable classes — the portal lives outside <main>.
 * Only mount after user interaction — it touches `document` during render.
 */
export function Portal({ children, className }: { children: React.ReactNode; className?: string }) {
  return createPortal(<div className={`contents ${className ?? ""}`}>{children}</div>, document.body);
}
