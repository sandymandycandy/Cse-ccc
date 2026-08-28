import { createAdminClient } from "@/lib/supabase/admin";
import { getClubByJoinToken } from "@/lib/admin/clubs";
import { validateRegistration, validatePhoto } from "@/lib/roster/validation";
import { handleImageUpload } from "@/lib/admin/image-upload";
import { checkMemberSignupLimits } from "@/lib/rate-limit";

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "unknown";
}

export async function POST(request: Request) {
  const len = Number(request.headers.get("content-length") ?? 0);
  if (len > 300_000) return Response.json({ error: "Payload too large." }, { status: 413 });

  let form: FormData;
  try { form = await request.formData(); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }

  const token = String(form.get("token") ?? "");
  const club = token ? await getClubByJoinToken(token) : null;
  if (!club) return Response.json({ error: "This registration link is invalid." }, { status: 404 });

  const parsed = validateRegistration({
    name: form.get("name"), roll: form.get("roll"), email: form.get("email"), phone: form.get("phone"),
  });
  if (!parsed.ok) return Response.json({ error: "Please check the form.", fields: parsed.errors }, { status: 400 });

  const photoFile = form.get("photo");
  const photoErr = validatePhoto(photoFile instanceof File ? { size: photoFile.size, type: photoFile.type } : null);
  if (photoErr) return Response.json({ error: photoErr, fields: { photo: photoErr } }, { status: 400 });

  const ip = clientIp(request);
  const limit = checkMemberSignupLimits({ ip, roll: parsed.value.roll });
  if (!limit.ok) return Response.json({ error: "Too many attempts. Try again later." },
    { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });

  const photo = await handleImageUpload(form, { bucket: "member-photos", field: "photo", maxBytes: 200 * 1024 });
  if (photo.error) return Response.json({ error: photo.error }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("club_members").insert({
    club_id: club.id, name: parsed.value.name, roll_no: parsed.value.roll,
    email: parsed.value.email, phone: parsed.value.phone, photo_path: photo.path ?? null,
    role: "member", is_active: true, approved_at: null, sort: 0, socials: {},
  });
  if (error?.code === "23505") return Response.json({ error: "That roll number is already registered." }, { status: 409 });
  if (error) { console.error("roster register failed", error); return Response.json({ error: "Something went wrong. Try again." }, { status: 500 }); }

  return Response.json({ ok: true, roll: parsed.value.roll });
}
