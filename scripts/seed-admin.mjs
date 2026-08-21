// Bootstrap / dev admin seeder.
//
// The invite flow (no emailed passwords) is how admins normally onboard; this
// script exists only to create the FIRST account(s) so there's something to log
// in with, and for local testing. It hashes with the same Argon2id parameters as
// src/lib/auth/password.ts.
//
//   node --env-file-if-exists=.env.local scripts/seed-admin.mjs \
//     --email tech@cse.test --name "Tech Head" --role tech_head --password "..."
//   node --env-file-if-exists=.env.local scripts/seed-admin.mjs \
//     --email head@cse.test --name "Coding Head" --role club_head --club <slug> --password "..."

import { createClient } from "@supabase/supabase-js";
import { argon2id } from "hash-wasm";
import { randomBytes } from "node:crypto";

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};

const email = (arg("email") || "").trim().toLowerCase();
const name = arg("name");
const role = arg("role", "tech_head");
const clubSlug = arg("club");
const password = arg("password") || process.env.SEED_ADMIN_PASSWORD;

if (!email || !name || !password) {
  console.error(
    "Usage: --email <e> --name <n> --password <p> [--role tech_head] [--club <slug>]",
  );
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

let clubId = null;
if (clubSlug) {
  const { data, error } = await supabase
    .from("clubs")
    .select("id")
    .eq("slug", clubSlug)
    .maybeSingle();
  if (error || !data) {
    console.error(`Club not found for slug "${clubSlug}".`);
    process.exit(1);
  }
  clubId = data.id;
}

const passwordHash = await argon2id({
  password,
  salt: randomBytes(16),
  parallelism: 1,
  iterations: 2,
  memorySize: 19 * 1024,
  hashLength: 32,
  outputType: "encoded",
});

const { data: existing } = await supabase
  .from("admin_users")
  .select("id")
  .ilike("email", email)
  .maybeSingle();

const row = {
  full_name: name,
  role,
  club_id: clubId,
  password_hash: passwordHash,
  is_active: true,
};

const res = existing
  ? await supabase.from("admin_users").update(row).eq("id", existing.id).select("id, email, role, club_id").single()
  : await supabase.from("admin_users").insert({ email, ...row }).select("id, email, role, club_id").single();

if (res.error) {
  console.error("Seed failed:", res.error.message);
  process.exit(1);
}
console.log(`${existing ? "Updated" : "Created"} admin:`, res.data);
