import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminSession } from "@/lib/auth/guards";
import { canView, canManage, grantFor } from "@/lib/auth/capabilities";
import { getAdminStats } from "./queries";

/**
 * What the admin landing page shows.
 *
 * Two halves, deliberately kept apart:
 *
 * - the **docket** — matters actually waiting, each with somewhere to go. This
 *   is the page's job.
 * - the **glance** — ambient counts that are context, not tasks.
 *
 * A number belongs to exactly one of them. Showing "3 pending" as both a tile
 * and a docket row would make the page look busier than the work is.
 *
 * The shaping is pure (`buildDocket` / `glanceTiles`) so the role rules are
 * testable without a database; only `getDashboardSignals` touches Supabase.
 */

export interface DashboardSignals {
  /** Events awaiting approval, already scoped to the session's reach. */
  pending: number;
  upcoming: number;
  events: number;
  feedbackOpen: boolean;
  feedbackResponses: number;
  contactUnhandled: number;
}

/** The slice of the capability matrix this page reasons about. */
export interface DashboardReach {
  canEvents: boolean;
  canApprove: boolean;
  canFeedback: boolean;
  canContact: boolean;
  canContent: boolean;
  clubScoped: boolean;
}

/**
 * `act` — waiting on the person reading the page.
 * `wait` — waiting on somebody else. Same number, different meaning, so it gets
 * a quieter treatment and no call to action.
 */
export type DocketTone = "act" | "wait";

export interface DocketItem {
  key: string;
  count: number;
  text: string;
  tone: DocketTone;
  href: string | null;
  cta: string | null;
}

export interface GlanceTile {
  label: string;
  n: number;
  href: string;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** The reach slice for a session. */
export function reachOf(session: AdminSession): DashboardReach {
  return {
    canEvents: canView(session, "manage:events"),
    canApprove: canView(session, "approve:events"),
    canFeedback: canView(session, "view:feedback"),
    canContact: canView(session, "manage:contact"),
    // `canManage`, not `canView` — the same check the layout gates the
    // Announcements link on, so the quick action never offers a page the nav
    // does not list.
    canContent: canManage(session, "manage:content"),
    clubScoped: grantFor(session.role, "manage:events") === "own",
  };
}

/**
 * Matters waiting, most-blocking first: approvals hold up the calendar, an
 * unanswered contact message leaves an outsider waiting, feedback can be read
 * whenever. Every row is gated on the grant as well as the count — a number the
 * caller happened to fetch never reaches a role that cannot act on it.
 */
export function buildDocket(s: DashboardSignals, reach: DashboardReach): DocketItem[] {
  const rows: DocketItem[] = [];

  if (s.pending > 0 && reach.canEvents) {
    rows.push(
      reach.canApprove
        ? {
            key: "approvals",
            count: s.pending,
            text: `${plural(s.pending, "event needs", "events need")} your approval`,
            tone: "act",
            href: "/admin/events/approvals",
            cta: "Review",
          }
        : {
            key: "approvals",
            count: s.pending,
            text: `${plural(s.pending, "event is", "events are")} with the approvers`,
            tone: "wait",
            href: "/admin/events",
            cta: null,
          },
    );
  }

  if (s.contactUnhandled > 0 && reach.canContact) {
    rows.push({
      key: "contact",
      count: s.contactUnhandled,
      text: `contact ${plural(s.contactUnhandled, "message is", "messages are")} unanswered`,
      tone: "act",
      href: "/admin/contact",
      cta: "Open inbox",
    });
  }

  // An open window with nothing in it is not waiting on anyone, and the quick
  // action already says the window is open.
  if (reach.canFeedback && s.feedbackOpen && s.feedbackResponses > 0) {
    rows.push({
      key: "feedback",
      count: s.feedbackResponses,
      text: `feedback ${plural(s.feedbackResponses, "response has", "responses have")} come in`,
      tone: "act",
      href: "/admin/feedback",
      cta: "Read",
    });
  }

  return rows;
}

export interface QuickAction {
  key: string;
  label: string;
  href: string;
  primary: boolean;
}

/**
 * Things the reader can *start*, as opposed to things waiting on them.
 *
 * Derived from grants so the block can be hidden entirely when it would be
 * empty: a docs_head holds one capability (`manage:resources`) and still lands
 * here, and an empty "Quick actions" heading is worse than no heading.
 *
 * The feedback open/close control is NOT here — it posts to a server action
 * rather than navigating, so the page renders it as a form alongside these.
 */
export function quickActions(reach: DashboardReach): QuickAction[] {
  const out: QuickAction[] = [];
  if (reach.canEvents) {
    out.push({ key: "event", label: "Create event", href: "/admin/events/new", primary: true });
  }
  if (reach.canContent) {
    out.push({
      key: "announcement",
      label: "Write announcement",
      href: "/admin/announcements/new",
      primary: out.length === 0,
    });
  }
  return out;
}

/**
 * The one-line answer to "is there anything for me?", used as the page's lead.
 *
 * Counts `act` rows only: a `wait` row is worth showing but is not a task, and
 * counting it would send someone looking for work that isn't theirs.
 */
export function docketSummary(rows: DocketItem[]): string {
  const n = rows.filter((r) => r.tone === "act").length;
  if (n === 0) return "Nothing needs your attention right now.";
  return `${n} ${plural(n, "thing needs", "things need")} your attention.`;
}

/**
 * Ambient counts. Zero is kept rather than hidden — "0 upcoming events" is
 * information, an absent tile is not. `pending` is deliberately absent: it is
 * the docket's.
 */
export function glanceTiles(s: DashboardSignals, reach: DashboardReach): GlanceTile[] {
  if (!reach.canEvents) return [];
  return [
    { label: "Upcoming events", n: s.upcoming, href: "/admin/events" },
    {
      label: reach.clubScoped ? "Your club's events" : "All events",
      n: s.events,
      href: "/admin/events",
    },
  ];
}

/**
 * Read the counts behind the page.
 *
 * Every admin hits this on every login, so the two council-wide reads are
 * `head`-only counts rather than the row-pulling list helpers those inboxes use
 * on their own pages (`listContactMessages` fetches up to 500 rows;
 * `listPeriods` fetches every response row). Each is skipped entirely for a role
 * without the grant — cheaper, and nothing is fetched that cannot be shown.
 */
export async function getDashboardSignals(session: AdminSession): Promise<DashboardSignals> {
  const reach = reachOf(session);
  const admin = createAdminClient();

  const [stats, feedback, contactUnhandled] = await Promise.all([
    getAdminStats(session),
    reach.canFeedback ? openFeedback(admin) : Promise.resolve(EMPTY_FEEDBACK),
    reach.canContact ? unhandledContactCount(admin) : Promise.resolve(0),
  ]);

  return {
    pending: stats.pending,
    upcoming: stats.upcoming,
    events: stats.events,
    feedbackOpen: feedback.open,
    feedbackResponses: feedback.responses,
    contactUnhandled,
  };
}

type Admin = ReturnType<typeof createAdminClient>;

const EMPTY_FEEDBACK = { open: false, responses: 0 };

/** The one open collection window, if any, and how many responses it holds. */
async function openFeedback(admin: Admin): Promise<{ open: boolean; responses: number }> {
  const { data, error } = await admin
    .from("feedback_periods")
    .select("id")
    .is("closed_at", null)
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return EMPTY_FEEDBACK;

  const { count, error: cErr } = await admin
    .from("feedback_responses")
    .select("id", { count: "exact", head: true })
    .eq("period_id", data.id);
  if (cErr) throw cErr;
  return { open: true, responses: count ?? 0 };
}

async function unhandledContactCount(admin: Admin): Promise<number> {
  const { count, error } = await admin
    .from("contact_messages")
    .select("id", { count: "exact", head: true })
    .is("handled_at", null);
  if (error) throw error;
  return count ?? 0;
}
