import type { ReactNode } from "react";
import "./attendance.css";

/**
 * Exists only to pull in `attendance.css` for every screen under /admin/attendance
 * — the dashboard, analytics, members and the session register all share it, and
 * importing it from one page would leave the others unstyled on a direct visit.
 */
export default function AttendanceLayout({ children }: { children: ReactNode }) {
  return children;
}
