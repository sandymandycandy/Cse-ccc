/**
 * One-off: download the bundled certificate fonts (spec §6.1) as static TTFs
 * from the Google Fonts CSS API, plus each family's OFL licence. Output goes to
 * public/fonts/cert/ and is committed. Re-run only to add or refresh a family.
 *
 *   node scripts/fetch-cert-fonts.mjs
 *
 * An old Safari user agent makes the API answer with `format('truetype')`
 * static instances instead of variable woff2.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import families from "../src/lib/certificates/font-families.json" with { type: "json" };

const OUT = path.join(import.meta.dirname, "..", "public", "fonts", "cert");
const UA =
  "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1";
const AXES = { r: [0, 400], b: [0, 700], i: [1, 400], bi: [1, 700] };

function cssUrl(family) {
  const name = family.googleName.replace(/ /g, "+");
  const tuples = family.variants.map((v) => AXES[v]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (family.variants.length === 1 && family.variants[0] === "r") return `https://fonts.googleapis.com/css2?family=${name}`;
  if (tuples.every(([ital]) => ital === 0)) {
    return `https://fonts.googleapis.com/css2?family=${name}:wght@${tuples.map((t) => t[1]).join(";")}`;
  }
  return `https://fonts.googleapis.com/css2?family=${name}:ital,wght@${tuples.map((t) => t.join(",")).join(";")}`;
}

async function get(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res;
}

await mkdir(OUT, { recursive: true });
for (const family of families) {
  const css = await (await get(cssUrl(family), { headers: { "user-agent": UA } })).text();
  const blocks = css.split("@font-face").slice(1);
  for (const variant of family.variants) {
    const [ital, wght] = AXES[variant];
    const block = blocks.find(
      (b) =>
        b.includes(`font-style: ${ital ? "italic" : "normal"}`) && b.includes(`font-weight: ${wght}`),
    );
    const url = block?.match(/url\((https:[^)]+\.ttf)\)/)?.[1];
    if (!url) throw new Error(`No TTF for ${family.id}-${variant}`);
    const bytes = new Uint8Array(await (await get(url)).arrayBuffer());
    await writeFile(path.join(OUT, `${family.id}-${variant}.ttf`), bytes);
    console.log(`${family.id}-${variant}.ttf  ${(bytes.length / 1024).toFixed(0)} KB`);
  }
  const licence = await (
    await get(`https://raw.githubusercontent.com/google/fonts/main/ofl/${family.oflDir}/OFL.txt`)
  ).text();
  await writeFile(path.join(OUT, `LICENSE-${family.id}.txt`), licence);
}
