import Link from "next/link";
import { Award, ClipboardCheck, Pencil, Users } from "lucide-react";

export function EventRowActions({ id, title }: { id: string; title: string }) {
  return <div className="event-row-actions">
    <Link href={`/admin/events/${id}/edit`} className="btn btn-ghost btn-sm" aria-label={`Edit ${title}`}><Pencil size={14} aria-hidden="true" /> Edit</Link>
    <Link href={`/admin/events/${id}/participants`} className="event-icon-action" aria-label={`Participants for ${title}`} title="Participants"><Users size={17} aria-hidden="true" /><span className="event-action-label">Participants</span></Link>
    <Link href={`/admin/events/${id}/registrations`} className="event-icon-action" aria-label={`Registrations and attendance for ${title}`} title="Registrations & attendance"><ClipboardCheck size={17} aria-hidden="true" /><span className="event-action-label">Attendance</span></Link>
    <Link href={`/admin/events/${id}/results`} className="event-icon-action" aria-label={`Results for ${title}`} title="Results"><Award size={17} aria-hidden="true" /><span className="event-action-label">Results</span></Link>
  </div>;
}
