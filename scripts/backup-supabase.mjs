// Full logical backup of the live Supabase project.
//
// Writes every row of every public table plus every storage object to a
// timestamped folder OUTSIDE the repo, with a manifest of row counts and
// SHA-256 hashes so a restore can be verified rather than assumed.
//
//   node --env-file-if-exists=.env.local scripts/backup-supabase.mjs
//   node --env-file-if-exists=.env.local scripts/backup-supabase.mjs --out D:/backups
//
// Read-only: it issues no INSERT, UPDATE or DELETE against any database.
//
// ⚠️ The output contains roll numbers, student emails, Argon2 password hashes
// and encrypted TOTP secrets. It is deliberately written outside the working
// tree so it can never be committed. Do not paste it anywhere.

import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Run with: node --env-file-if-exists=.env.local scripts/backup-supabase.mjs",
  );
  process.exit(1);
}

// Primary keys matter: pagination without a stable sort can silently skip or
// duplicate rows between pages, which is exactly the failure a backup must not
// have. Three tables do not key on `id`, and event_clubs is composite.
const TABLES = {
  achievements: ["id"],
  admin_invites: ["id"],
  admin_password_resets: ["id"],
  admin_totp: ["admin_id"],
  admin_users: ["id"],
  announcements: ["id"],
  attendance_scans: ["id"],
  attendance_sessions: ["id"],
  audit_log: ["id"],
  blackout_dates: ["id"],
  certificates: ["id"],
  club_attendance: ["id"],
  club_attendance_sessions: ["id"],
  club_member_auth: ["member_id"],
  club_members: ["id"],
  clubs: ["id"],
  contact_messages: ["id"],
  council_attendance: ["id"],
  council_attendance_sessions: ["id"],
  council_members: ["id"],
  council_settings: ["id"],
  email_log: ["id"],
  email_preferences: ["id"],
  event_clubs: ["event_id", "club_id"],
  event_feedback: ["id"],
  event_rounds: ["id"],
  events: ["id"],
  feedback_periods: ["id"],
  feedback_responses: ["id"],
  gallery: ["id"],
  join_requests: ["id"],
  media: ["id"],
  member_invites: ["id"],
  recruitment_drives: ["id"],
  registrations: ["id"],
  resources: ["id"],
  results: ["id"],
  student_devices: ["id"],
  venue_bookings: ["id"],
  venues: ["id"],
  waitlist: ["id"],
};

const PAGE = 1000;
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const repoRoot = process.cwd();
const outRoot = path.resolve(arg("out", path.join(repoRoot, "..", "ccc-backups")), stamp);

// Refuse to write inside the repo — this content must never be committable.
if (!path.relative(repoRoot, outRoot).startsWith("..")) {
  console.error(`Refusing to write a backup inside the repo: ${outRoot}`);
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

mkdirSync(path.join(outRoot, "tables"), { recursive: true });

console.log(`Backing up ${new URL(url).host}`);
console.log(`  -> ${outRoot}\n`);

const manifest = { generatedAt: new Date().toISOString(), host: new URL(url).host, tables: [], storage: [] };
let totalRows = 0;
const problems = [];

for (const [table, pk] of Object.entries(TABLES)) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select("*").range(from, from + PAGE - 1);
    for (const col of pk) q = q.order(col, { ascending: true });
    const { data, error } = await q;
    if (error) {
      problems.push(`${table}: ${error.message}`);
      break;
    }
    rows.push(...data);
    if (data.length < PAGE) break;
  }

  // NDJSON: one row per line, so a corrupted byte costs one row, not the file.
  const body = Buffer.from(rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""), "utf8");
  const file = path.join(outRoot, "tables", `${table}.ndjson`);
  writeFileSync(file, body);
  manifest.tables.push({ table, pk, rows: rows.length, bytes: body.length, sha256: sha256(body) });
  totalRows += rows.length;
  console.log(`  ${table.padEnd(30)} ${String(rows.length).padStart(6)} rows`);
}

// ---- storage -------------------------------------------------------------
const listRecursive = async (bucket, prefix = "") => {
  const out = [];
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) {
    problems.push(`storage ${bucket}/${prefix}: ${error.message}`);
    return out;
  }
  for (const entry of data) {
    const full = prefix ? `${prefix}/${entry.name}` : entry.name;
    // PostgREST returns folders as rows with a null id.
    if (entry.id === null) out.push(...(await listRecursive(bucket, full)));
    else out.push(full);
  }
  return out;
};

const { data: buckets, error: bucketErr } = await supabase.storage.listBuckets();
if (bucketErr) problems.push(`listBuckets: ${bucketErr.message}`);

console.log("");
let totalObjects = 0;
for (const bucket of buckets ?? []) {
  const paths = await listRecursive(bucket.name);
  for (const p of paths) {
    const { data, error } = await supabase.storage.from(bucket.name).download(p);
    if (error) {
      problems.push(`download ${bucket.name}/${p}: ${error.message}`);
      continue;
    }
    const buf = Buffer.from(await data.arrayBuffer());
    const dest = path.join(outRoot, "storage", bucket.name, p);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, buf);
    manifest.storage.push({ bucket: bucket.name, path: p, bytes: buf.length, sha256: sha256(buf) });
    totalObjects += 1;
  }
  console.log(`  bucket ${bucket.name.padEnd(24)} ${String(paths.length).padStart(4)} objects`);
}

manifest.buckets = (buckets ?? []).map((b) => ({
  name: b.name,
  public: b.public,
  file_size_limit: b.file_size_limit,
  allowed_mime_types: b.allowed_mime_types,
}));
manifest.totals = { tables: manifest.tables.length, rows: totalRows, objects: totalObjects };
manifest.problems = problems;

const manifestBody = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");
writeFileSync(path.join(outRoot, "manifest.json"), manifestBody);

console.log(`\n${totalRows} rows across ${manifest.tables.length} tables, ${totalObjects} storage objects`);
console.log(`manifest.json sha256 ${sha256(manifestBody).slice(0, 16)}…`);
console.log(`written to ${outRoot}`);

if (problems.length) {
  console.error(`\n${problems.length} PROBLEM(S) — this backup is NOT complete:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log("\nBackup complete, no errors.");
