import { createAdminClient } from "@/lib/supabase/admin";
import { getCouncilByJoinToken } from "@/lib/admin/attendance-council";
import { validateCouncilRegistration } from "@/lib/council/validation";
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
  const council = token ? await getCouncilByJoinToken(token) : null;
  if (!council) return Response.json({ error: "This registration link is invalid." }, { status: 404 });

  const parsed = validateCouncilRegistration({
    name: form.get("name"), roll: form.get("roll"), email: form.get("email"),
    phone: form.get("phone"), designation: form.get("designation"),
  });
  if (!parsed.ok) return Response.json({ error: "Please check the form.", fields: parsed.errors }, { status: 400 });

  const ip = clientIp(request);
  const limit = checkMemberSignupLimits({ ip, roll: parsed.value.roll });
  if (!limit.ok) return Response.json({ error: "Too many attempts. Try again later." },
    { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });

  const admin = createAdminClient();
  const { error } = await admin.from("council_members").insert({
    full_name: parsed.value.name, roll_no: parsed.value.roll,
    email: parsed.value.email, phone: parsed.value.phone,
    designation: parsed.value.designation, is_active: true, approved_at: null,
  });
  if (error?.code === "23505") return Response.json({ error: "That roll number is already registered." }, { status: 409 });
  if (error) { console.error("council register failed", error); return Response.json({ error: "Something went wrong. Try again." }, { status: 500 }); }

  return Response.json({ ok: true, roll: parsed.value.roll });
}
