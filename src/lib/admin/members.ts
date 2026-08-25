import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/database.types";

export type MemberRole = Database["public"]["Enums"]["member_role"];

export interface AdminMemberRow {
  id: string;
  name: string;
  rollNo: string | null;
  role: MemberRole;
  isActive: boolean;
  sort: number;
  clubId: string;
  clubName: string | null;
}

export interface MemberForEdit {
  id: string;
  name: string;
  rollNo: string | null;
  email: string | null;
  phone: string | null;
  role: MemberRole;
  sort: number;
  isActive: boolean;
  clubId: string;
}

export async function listMembers(clubId: string): Promise<AdminMemberRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("club_members")
    .select("id, name, roll_no, role, is_active, sort, club_id, clubs(name)")
    .eq("club_id", clubId)
    .order("sort", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    rollNo: m.roll_no,
    role: m.role,
    isActive: m.is_active,
    sort: m.sort,
    clubId: m.club_id,
    clubName: m.clubs?.name ?? null,
  }));
}

export async function getMemberForEdit(id: string): Promise<MemberForEdit | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("club_members")
    .select("id, name, roll_no, email, phone, role, sort, is_active, club_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    rollNo: data.roll_no,
    email: data.email,
    phone: data.phone,
    role: data.role,
    sort: data.sort,
    isActive: data.is_active,
    clubId: data.club_id,
  };
}
