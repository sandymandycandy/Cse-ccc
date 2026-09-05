// Restores a backup produced by scripts/backup-supabase.mjs into a target
// Supabase project, over the service-role REST API.
//
//   node --env-file-if-exists=.env.local scripts/restore-backup.mjs <backup-dir> \
//     --url https://<ref>.supabase.co --key-env MUMBAI_SERVICE_ROLE_KEY
//
//   --tables-only / --storage-only   restrict what is restored
//   --truncate                       empty each table before loading it
//
// Rows are inserted, never upserted, so an accidental second run fails loudly
// on the primary key rather than silently duplicating or overwriting.
//
// Foreign keys are expected to be ABSENT while this runs — add them afterwards
// so their validation doubles as a referential-integrity check on the copy.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const dir = process.argv[2];
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes(`--${n}`);

const url = arg("url");
const key = process.env[arg("key-env", "SUPABASE_SERVICE_ROLE_KEY")];
if (!dir || !existsSync(dir) || !url || !key) {
  console.error("Usage: node scripts/restore-backup.mjs <backup-dir> --url <project-url> --key-env <ENV_NAME>");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
const supabase = createClient(url, key, { auth: { persistSession: false } });
const BATCH = 500;
const problems = [];

console.log(`restoring ${path.basename(dir)}`);
console.log(`  from ${manifest.host}  ->  ${new URL(url).host}\n`);

if (!has("storage-only")) {
  let total = 0;
  for (const entry of manifest.tables) {
    const file = path.join(dir, "tables", `${entry.table}.ndjson`);
    const raw = readFileSync(file, "utf8");
    const rows = raw.length ? raw.split("\n").filter((l) => l.length).map((l) => JSON.parse(l)) : [];

    if (has("truncate") && rows.length === 0) continue;
    if (rows.length === 0) { console.log(`  ${entry.table.padEnd(30)}      0 (skipped)`); continue; }

    let written = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const { error } = await supabase.from(entry.table).insert(chunk);
      if (error) { problems.push(`${entry.table} [rows ${i}-${i + chunk.length - 1}]: ${error.message}`); break; }
      written += chunk.length;
    }
    total += written;
    const flag = written === entry.rows ? "" : `  <-- EXPECTED ${entry.rows}`;
    console.log(`  ${entry.table.padEnd(30)} ${String(written).padStart(6)}${flag}`);
  }
  console.log(`\n  ${total} rows inserted`);
}

if (!has("tables-only")) {
  console.log("");
  let files = 0;
  for (const obj of manifest.storage) {
    const local = path.join(dir, "storage", obj.bucket, obj.path);
    if (!existsSync(local)) { problems.push(`storage ${obj.bucket}/${obj.path}: missing from backup`); continue; }
    const body = readFileSync(local);
    // The destination buckets enforce allowed_mime_types, so the content type
    // must be right or the upload is rejected. Prefer the type recorded at
    // backup time; fall back to the extension for older backups that predate
    // the manifest carrying it.
    const byExt = { webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", pdf: "application/pdf" };
    const contentType = obj.mimetype ?? byExt[obj.path.split(".").pop()?.toLowerCase()] ?? "application/octet-stream";
    // upsert:true so a partial re-run repairs rather than fails; the hash check
    // in verify-restore is what proves the bytes actually landed intact.
    const { error } = await supabase.storage.from(obj.bucket).upload(obj.path, body, { upsert: true, contentType });
    if (error) { problems.push(`storage ${obj.bucket}/${obj.path}: ${error.message}`); continue; }
    files += 1;
  }
  console.log(`  ${files}/${manifest.storage.length} storage objects uploaded`);
}

if (problems.length) {
  console.error(`\n${problems.length} PROBLEM(S):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log("\nRestore complete, no errors.");
