import {
  Activity, Award, BookOpen, CalendarDays, CheckCheck, ClipboardCheck,
  FileClock, Images, Inbox, LayoutDashboard, Mail, Megaphone,
  MessageSquare, Send, ShieldCheck, Users, UsersRound, type LucideIcon,
} from "lucide-react";

const icons: Record<string, LucideIcon> = {
  "/admin": LayoutDashboard,
  "/admin/oversight/clubs": Activity,
  "/admin/events": CalendarDays,
  "/admin/events/approvals": CheckCheck,
  "/admin/certificates": Award,
  "/admin/announcements": Megaphone,
  "/admin/gallery": Images,
  "/admin/achievements": Award,
  "/admin/attendance": ClipboardCheck,
  "/admin/council": UsersRound,
  "/admin/team": Users,
  "/admin/resources": BookOpen,
  "/admin/clubs": UsersRound,
  "/admin/contact": Inbox,
  "/admin/feedback": MessageSquare,
  "/admin/email": Mail,
  "/admin/outbox": Send,
  "/admin/users": ShieldCheck,
  "/admin/audit": FileClock,
};

export function AdminIcon({ href, size = 18 }: { href: string; size?: number }) {
  const Icon = icons[href] ?? LayoutDashboard;
  return <Icon size={size} strokeWidth={1.7} aria-hidden="true" />;
}
