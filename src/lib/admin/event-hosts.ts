import {
  canManage,
  grantFor,
  type AdminIdentity,
  type Capability,
} from "@/lib/auth/capabilities";

/**
 * Which clubs host an event, and what that lets each of them do.
 *
 * Pure on purpose: this is the authorisation boundary for co-hosted events
 * (spec 2026-09-15 §1), and it has to be provable without a database.
 *
 * ⚠️ Why it exists: the club-scoped event LIST has always matched any
 * `event_clubs` row, primary or not, while every permission check resolved
 * the primary club only. A second link row would have shown a co-host's head
 * the event and refused them on every action. Every event permission check
 * goes through here instead of `canManage(…, primaryClubId)`.
 */
export interface EventHosts {
  /** The club that owns the event. Null only for a legacy row with no link. */
  primaryClubId: string | null;
  /** Every hosting club, primary first. */
  clubIds: string[];
}

export const NO_HOSTS: EventHosts = { primaryClubId: null, clubIds: [] };

/**
 * Hosts from `event_clubs` rows. The primary is the `is_primary` row, falling
 * back to the first row, exactly as every read site did before this module.
 */
export function hostsFromLinks(
  links: readonly { club_id: string; is_primary: boolean }[] | null | undefined,
): EventHosts {
  const rows = links ?? [];
  const primary = rows.find((l) => l.is_primary) ?? rows[0];
  if (!primary) return NO_HOSTS;
  const others = rows.map((l) => l.club_id).filter((id) => id !== primary.club_id);
  return { primaryClubId: primary.club_id, clubIds: [primary.club_id, ...new Set(others)] };
}

/** The co-hosts alone: every hosting club except the primary. */
export function cohostIdsOf(hosts: EventHosts): string[] {
  return hosts.clubIds.filter((id) => id !== hosts.primaryClubId);
}

/**
 * Co-host ids as submitted, made safe to write: blanks dropped, repeats
 * collapsed, and the primary removed, because a club is never its own co-host.
 */
export function normalizeCohosts(primaryClubId: string, ids: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || id === primaryClubId || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

/** True when the identity's own club is one of the event's hosts. */
function hostsOwnClub(id: AdminIdentity, hosts: EventHosts): boolean {
  if (id.clubId == null) return false;
  return id.clubId === hosts.primaryClubId || hosts.clubIds.includes(id.clubId);
}

/** May this identity act on the event through ANY of its hosting clubs? */
export function canManageEvent(id: AdminIdentity, cap: Capability, hosts: EventHosts): boolean {
  const grant = grantFor(id.role, cap);
  if (grant === "all") return true;
  if (grant === "own") return hostsOwnClub(id, hosts);
  return false;
}

/**
 * May this identity SEE the event's surface for `cap`? `all` and `read` see any
 * event, and `own` sees the events its club hosts. This is to `canManageEvent`
 * what `canViewClub` is to `canManage`.
 */
export function canViewEvent(id: AdminIdentity, cap: Capability, hosts: EventHosts): boolean {
  const grant = grantFor(id.role, cap);
  if (grant === "all" || grant === "read") return true;
  if (grant === "own") return hostsOwnClub(id, hosts);
  return false;
}

/**
 * Cancelling is irreversible, so it stays with the club that owns the event: an
 * `own` grant matches the PRIMARY club only. A co-host can do everything else.
 */
export function canCancelEvent(id: AdminIdentity, hosts: EventHosts): boolean {
  return canManage(id, "cancel:events", hosts.primaryClubId);
}

/**
 * Reassigning the primary needs `all`, or managing events for the CURRENT
 * primary club.
 *
 * ⚠️ Without this, a co-host could make its own club primary and lock the
 * original club out of cancelling its own event.
 */
export function canSetPrimary(id: AdminIdentity, hosts: EventHosts): boolean {
  return canManage(id, "manage:events", hosts.primaryClubId);
}

/** The `event_clubs` writes that turn one set of hosts into another. */
export interface HostPlan {
  /** Co-host rows to delete: removed co-hosts, and a co-host being promoted to primary. */
  removeCohosts: string[];
  /** `insert` when the event has no primary row yet; `move` repoints the existing one in place. */
  primary: { op: "insert" | "move"; clubId: string } | null;
  /** Co-host rows to insert, including a former primary kept on as a co-host. */
  addCohosts: string[];
}

export function planHostChanges(
  current: EventHosts,
  desired: { primaryClubId: string; cohostIds: readonly string[] },
): HostPlan {
  const wanted = normalizeCohosts(desired.primaryClubId, desired.cohostIds);
  const have = cohostIdsOf(current);
  return {
    removeCohosts: have.filter((id) => !wanted.includes(id)),
    primary:
      current.primaryClubId == null
        ? { op: "insert", clubId: desired.primaryClubId }
        : current.primaryClubId !== desired.primaryClubId
          ? { op: "move", clubId: desired.primaryClubId }
          : null,
    addCohosts: wanted.filter((id) => !have.includes(id)),
  };
}

export function isEmptyPlan(plan: HostPlan): boolean {
  return plan.removeCohosts.length === 0 && plan.primary === null && plan.addCohosts.length === 0;
}

/**
 * The hosts a duplicated event starts with. The copy keeps every host, but a
 * club-scoped creator's own club is always the primary (spec §2), and a
 * duplicate is a creation. So when a co-host's head duplicates an event, their
 * club owns the copy and the original owner stays on as a co-host.
 *
 * Callers must already have passed `canManageEvent` for the source event.
 */
export function hostsForCopy(id: AdminIdentity, source: EventHosts): EventHosts {
  if (grantFor(id.role, "manage:events") !== "own" || id.clubId == null) return source;
  if (id.clubId === source.primaryClubId) return source;
  return {
    primaryClubId: id.clubId,
    clubIds: [id.clubId, ...source.clubIds.filter((c) => c !== id.clubId)],
  };
}
