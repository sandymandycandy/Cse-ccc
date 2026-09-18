import type { LayerId, SmtGroup } from "@/data/ccc";

/** One colour per layer, drawn from the main site's palette, used consistently everywhere. */
export const layerTone: Record<LayerId, { text: string; bg: string; tint: string; border: string }> = {
  president: { text: "text-forest", bg: "bg-forest", tint: "bg-forest-tint", border: "border-forest" },
  council: { text: "text-clay", bg: "bg-clay", tint: "bg-clay-tint", border: "border-clay" },
  clubs: { text: "text-ink", bg: "bg-ink-2", tint: "bg-sand", border: "border-ink-2" },
  smt: { text: "text-rust", bg: "bg-rust", tint: "bg-rust-tint", border: "border-rust" },
};

export const smtTone: Record<SmtGroup, string> = {
  Coordination: "bg-forest",
  Camera: "bg-clay",
  "Post-production": "bg-rust",
  Analytics: "bg-forest-deep",
  Writing: "bg-ink-2",
  "On-screen": "bg-ink-4",
};

export const layerAnchor: Record<LayerId, string> = {
  president: "president",
  council: "council",
  clubs: "clubs",
  smt: "smt",
};
