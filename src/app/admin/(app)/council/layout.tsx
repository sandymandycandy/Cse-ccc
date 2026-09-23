import type { ReactNode } from "react";
import "../attendance/attendance.css";

// Council analytics uses the same attendance components as club analytics.
// Load their styles on direct visits as well as client-side navigation.
export default function CouncilLayout({ children }: { children: ReactNode }) {
  return children;
}
