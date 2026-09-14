"use client";

import { zip, type Zippable } from "fflate";

/**
 * Build a ZIP of certificates in the browser (spec §5.5): each PDF is fetched
 * on its own, so no server response ever carries more than one certificate and
 * a 300-person download can't hit a response-size limit. The caller shows
 * progress and can stop it.
 */

export interface ZipItem {
  certificateId: string;
  /** File name inside the archive, without the extension conflict handling. */
  filename: string;
}

export interface ZipProgress {
  done: number;
  total: number;
  failed: number;
}

/** Make every entry name unique — two people can share a name. */
function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) {
    taken.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 2; ; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
}

export async function buildCertificateZip(
  items: ZipItem[],
  onProgress: (p: ZipProgress) => void,
  shouldStop: () => boolean,
): Promise<{ blob: Blob; failed: number } | { error: string }> {
  const files: Zippable = {};
  const taken = new Set<string>();
  let failed = 0;
  let done = 0;

  for (const item of items) {
    if (shouldStop()) return { error: "Stopped." };
    try {
      const res = await fetch(`/api/admin/certificates/${item.certificateId}/pdf`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const bytes = new Uint8Array(await res.arrayBuffer());
      files[uniqueName(item.filename, taken)] = bytes;
    } catch {
      failed++;
    }
    done++;
    onProgress({ done, total: items.length, failed });
  }

  if (Object.keys(files).length === 0) return { error: "None of those certificates could be downloaded." };

  const archive = await new Promise<Uint8Array>((resolve, reject) => {
    // level 0: PDFs are already compressed, so this is much faster and no bigger.
    zip(files, { level: 0 }, (err, data) => (err ? reject(err) : resolve(data)));
  });
  return { blob: new Blob([new Uint8Array(archive)], { type: "application/zip" }), failed };
}

/** Hand the finished archive to the browser as a download. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
