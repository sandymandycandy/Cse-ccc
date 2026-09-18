import { ChevronRight } from "lucide-react";

import { counts, getLayer, layers, pad, type LayerId } from "@/data/ccc";
import { Reveal } from "./Reveal";
import { layerTone } from "./tones";

/**
 * Opens each layer: a large layer number, where it sits in the hierarchy
 * (President › Council › …), the title and what the layer does.
 */
export function SectionIntro({ layer, title }: { layer: LayerId; title: React.ReactNode }) {
  const meta = getLayer(layer);
  const count = counts.byLayer[layer];
  const path = layers.slice(0, meta.number);

  return (
    <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
      <Reveal className="flex items-end gap-4 lg:col-span-4 lg:flex-col lg:items-start lg:gap-3">
        <span className={`font-serif text-[clamp(4.5rem,11vw,8.5rem)] leading-[0.8] ${layerTone[layer].text}`}>{pad(meta.number)}</span>
        <span className="pb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3 lg:pb-0">
          {meta.label} · {count} {count === 1 ? "person" : "people"}
        </span>
      </Reveal>

      <Reveal className="lg:col-span-8" delay={0.06}>
        <nav aria-label="Position in the council" className="font-mono text-[11px] uppercase tracking-[0.14em]">
          <ol className="flex flex-wrap items-center gap-1.5 text-ink-3">
            {path.map((l, i) => (
              <li key={l.id} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight aria-hidden className="size-3" />}
                {l.id === layer ? (
                  <span aria-current="location" className="text-ink">
                    {l.short}
                  </span>
                ) : (
                  <a href={`#${l.id}`} className="hover:text-ink">
                    {l.short}
                  </a>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <h2 id={`${layer}-title`} className="mt-4 font-serif text-[clamp(2.6rem,5.4vw,4.75rem)] leading-[0.98] tracking-[-0.01em]">
          {title}
        </h2>
        <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-ink-2">{meta.summary}</p>
      </Reveal>
    </div>
  );
}
