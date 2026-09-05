// Row-level reconciliation between two Supabase projects.
//
//   node --env-file-if-exists=.env.local scripts/reconcile.mjs \
//     --source-url https://A.supabase.co --source-key-env SUPABASE_SERVICE_ROLE_KEY \
//     --target-url https://B.supabase.co --target-key-env MUMBAI_SERVICE_ROLE_KEY \
//     [--insert-missing]
//
// Compares every row of every table by primary key and content, and reports
// three categories:
//
//   MISSING  in source, absent from target  -> an insert that landed mid-window
//   DIFFERS  present in both, content differs
//   EXTRA    in target, absent from source
//
// --insert-missing copies the MISSING rows across. That is always safe: an
// insert of a row the target does not have cannot destroy anything.
//
// DIFFERS is deliberately REPORT-ONLY and there is no flag to auto-apply it.
// Before cutover, every difference is a source-side change and overwriting is
// safe. After cutover the target is live, so a difference may be a NEW edit
// made there — blindly overwriting from the source would silently revert real
// work. Those rows are printed with both versions and applied by hand, with
// the relevant set_updated_at trigger disabled so the repair does not stamp
// now() over the timestamp being restored.

import { createClient } from "@supabase/supabase-js";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes(`--${n}`);

const sourceUrl = arg("source-url");
const targetUrl = arg("target-url");
const sourceKey = process.env[arg("source-key-env", "SUPABASE_SERVICE_ROLE_KEY")];
const targetKey = process.env[arg("target-key-env", "MUMBAI_SERVICE_ROLE_KEY")];
if (!sourceUrl || !targetUrl || !sourceKey || !targetKey) {
  console.error("Usage: node scripts/reconcile.mjs --source-url <> --source-key-env <> --target-url <> --target-key-env <> [--insert-missing]");
  process.exit(1);
}

// Same primary-key map the backup uses; three tables do not key on `id`.
const TABLES = {
  achievements: ["id"], admin_invites: ["id"], admin_password_resets: ["id"], admin_totp: ["admin_id"],
  admin_users: ["id"], announcements: ["id"], attendance_scans: ["id"], attendance_sessions: ["id"],
  audit_log: ["id"], blackout_dates: ["id"], certificates: ["id"], club_attendance: ["id"],
  club_attendance_sessions: ["id"], club_member_auth: ["member_id"], club_members: ["id"], clubs: ["id"],
  contact_messages: ["id"], council_attendance: ["id"], council_attendance_sessions: ["id"],
  council_members: ["id"], council_settings: ["id"], email_log: ["id"], email_preferences: ["id"],
  event_clubs: ["event_id", "club_id"], event_feedback: ["id"], event_rounds: ["id"], events: ["id"],
  feedback_periods: ["id"], feedback_responses: ["id"], gallery: ["id"], join_requests: ["id"],
  media: ["id"], member_invites: ["id"], recruitment_drives: ["id"], registrations: ["id"],
  resources: ["id"], results: ["id"], student_devices: ["id"], venue_bookings: ["id"],
  venues: ["id"], waitlist: ["id"],
};

const PAGE = 1000;
const src = createClient(sourceUrl, sourceKey, { auth: { persistSession: false } });
const dst = createClient(targetUrl, targetKey, { auth: { persistSession: false } });

const fetchAll = async (client, table, pk) => {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let q = client.from(table).select("*").range(from, from + PAGE - 1);
    for (const c of pk) q = q.order(c, { ascending: true });
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
};

// Stable serialisation: key order must not affect equality.
const canon = (row) => JSON.stringify(Object.keys(row).sort().map((k) => [k, row[k]]));

let missingTotal = 0, differsTotal = 0, extraTotal = 0, inserted = 0;
const detail = [];

for (const [table, pk] of Object.entries(TABLES)) {
  const [a, b] = await Promise.all([fetchAll(src, table, pk), fetchAll(dst, table, pk)]);
  const key = (r) => pk.map((c) => String(r[c])).join("::");
  const byB = new Map(b.map((r) => [key(r), r]));
  const seen = new Set();

  const missing = [], differs = [];
  for (const r of a) {
    const k = key(r);
    seen.add(k);
    const other = byB.get(k);
    if (!other) missing.push(r);
    else if (canon(r) !== canon(other)) differs.push({ k, source: r, target: other });
  }
  const extra = b.filter((r) => !seen.has(key(r)));

  if (missing.length || differs.length || extra.length) {
    console.log(`${table.padEnd(30)} missing ${String(missing.length).padStart(4)}   differs ${String(differs.length).padStart(4)}   extra ${String(extra.length).padStart(4)}`);
    missingTotal += missing.length; differsTotal += differs.length; extraTotal += extra.length;
    for (const d of differs) {
      const changed = Object.keys(d.source).filter((k) => JSON.stringify(d.source[k]) !== JSON.stringify(d.target[k]));
      detail.push(`  DIFFERS ${table} ${d.k}\n    columns: ${changed.join(", ")}\n    source: ${changed.map((c) => `${c}=${JSON.stringify(d.source[c])}`).join("  ")}\n    target: ${changed.map((c) => `${c}=${JSON.stringify(d.target[c])}`).join("  ")}`);
    }
    for (const e of extra) detail.push(`  EXTRA   ${table} ${key(e)}  (only in target — expected only for post-cutover writes)`);

    if (missing.length && has("insert-missing")) {
      for (let i = 0; i < missing.length; i += 500) {
        const { error } = await dst.from(table).insert(missing.slice(i, i + 500));
        if (error) { detail.push(`  INSERT FAILED ${table}: ${error.message}`); break; }
        inserted += Math.min(500, missing.length - i);
      }
    }
  }
}

console.log(`\nmissing ${missingTotal}   differs ${differsTotal}   extra ${extraTotal}`);
if (has("insert-missing")) console.log(`inserted ${inserted} missing rows into target`);
if (detail.length) { console.log(""); for (const d of detail) console.log(d); }

if (missingTotal === 0 && differsTotal === 0 && extraTotal === 0) {
  console.log("\nIN SYNC — every row matches on both sides.");
} else {
  console.log("\nNOT in sync. DIFFERS rows are never auto-applied; see the note at the top of this file.");
  process.exit(1);
}
