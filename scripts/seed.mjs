// CSV → DB seed importer (BUILD_PLAN §1 "seed via CSV import", Phase 0).
// Idempotent: upserts clubs from seed/clubs.csv keyed on slug.
//
// Run:  npm run seed        (loads .env.local if present)
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the env.
//
// The service-role key bypasses RLS, which is required to write seed data — so
// this runs only from a trusted shell, never in the browser.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Copy .env.example to .env.local and fill them in.",
  );
  process.exit(1);
}

/** Minimal RFC-4180-ish CSV parser (handles quoted fields with commas). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      if (field !== "" || row.length) { row.push(field); rows.push(row); }
      row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function readCsvObjects(relPath) {
  const raw = readFileSync(join(root, relPath), "utf8");
  const [header, ...lines] = parseCsv(raw);
  return lines.map((cols) =>
    Object.fromEntries(header.map((h, i) => [h.trim(), cols[i]?.trim() ?? ""])),
  );
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

async function seedClubs() {
  const clubs = readCsvObjects("seed/clubs.csv").map((c) => ({
    slug: c.slug,
    name: c.name,
    short_name: c.short_name,
    category: c.category,
    color: c.color,
    tagline: c.tagline,
    sort: Number(c.sort) || 0,
  }));

  const { error } = await supabase
    .from("clubs")
    .upsert(clubs, { onConflict: "slug" });
  if (error) throw error;
  console.log(`✓ seeded ${clubs.length} clubs`);
}

try {
  await seedClubs();
  console.log("Seed complete.");
} catch (err) {
  console.error("Seed failed:", err.message ?? err);
  process.exit(1);
}
