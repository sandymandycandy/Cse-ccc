const LABEL: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

/** Approval-state pill for admin tables. */
export function ApprovalBadge({ status }: { status: string }) {
  return (
    <span className={`abadge abadge-${status}`}>{LABEL[status] ?? status}</span>
  );
}
