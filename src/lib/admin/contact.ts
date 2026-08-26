import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Admin-side reads of the public contact-form inbox (service role — the table
 *  has no anon grant). Council-wide: no club scope. */

export interface ContactMessageRow {
  id: string;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  createdAt: string;
  handledAt: string | null;
}

export async function listContactMessages(): Promise<ContactMessageRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("contact_messages")
    .select("id, name, email, subject, message, created_at, handled_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map(toRow);
}

export async function getContactMessage(id: string): Promise<ContactMessageRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("contact_messages")
    .select("id, name, email, subject, message, created_at, handled_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? toRow(data) : null;
}

function toRow(r: {
  id: string;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  created_at: string;
  handled_at: string | null;
}): ContactMessageRow {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    subject: r.subject,
    message: r.message,
    createdAt: r.created_at,
    handledAt: r.handled_at,
  };
}
