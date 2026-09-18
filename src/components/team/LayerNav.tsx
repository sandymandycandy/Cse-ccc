"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";

import { counts, layers, pad, type LayerId } from "@/data/ccc";
import { layerTone } from "./tones";

/** Sticky layer navigation: tracks which layer you're reading and how far through the team you are. */
export function LayerNav() {
  const [active, setActive] = useState<LayerId>("president");
  const raw = useMotionValue(0);
  const progress = useSpring(raw, { stiffness: 200, damping: 40 });

  useEffect(() => {
    const sections = layers.map((l) => document.getElementById(l.id)).filter(Boolean) as HTMLElement[];
    let frame = 0;
    const update = () => {
      // Viewport-relative positions: offsetTop would be relative to the wrapper, not the page.
      const probe = window.innerHeight * 0.4;
      let current: LayerId = layers[0].id;
      for (const s of sections) if (s.getBoundingClientRect().top <= probe) current = s.id as LayerId;
      setActive(current);

      const first = sections[0];
      const last = sections[sections.length - 1];
      if (!first || !last) return;
      const start = first.getBoundingClientRect().top - probe;
      const end = last.getBoundingClientRect().bottom - window.innerHeight * 0.6;
      raw.set(Math.min(1, Math.max(0, -start / (end - start))));
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [raw]);

  return (
    <nav aria-label="Team layers" className="sticky top-[var(--hdr)] z-40 border-y border-line bg-paper/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1440px] items-center gap-6 px-5 sm:px-8 lg:px-14">
        <p className="hidden shrink-0 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3 lg:block">The team, by layer</p>
        <ol className="-mx-2 flex flex-1 justify-between py-2 sm:justify-start lg:justify-end">
          {layers.map((l) => {
            const on = active === l.id;
            return (
              <li key={l.id} className="shrink-0">
                <a
                  href={`#${l.id}`}
                  aria-current={on ? "location" : undefined}
                  className="relative flex h-11 items-center gap-1.5 rounded-full px-3 text-[14px] transition-colors focus-visible:outline-2 focus-visible:outline-forest sm:h-10 sm:gap-2 sm:px-4"
                >
                  {on && <motion.span layoutId="layer-nav-pill" className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", stiffness: 400, damping: 36 }} />}
                  <span className={`relative size-1.5 rounded-full ${layerTone[l.id].bg}`} />
                  <span className={`relative hidden font-mono text-[11px] tabular-nums sm:inline ${on ? "text-paper/60" : "text-ink-3"}`}>{pad(l.number)}</span>
                  <span className={`relative whitespace-nowrap ${on ? "text-paper" : "text-ink-2 hover:text-ink"}`}>
                    <span className="sm:hidden">{l.id === "president" ? "Pres." : l.short}</span>
                    <span className="hidden sm:inline">{l.short}</span>
                  </span>
                  <span className={`relative hidden font-mono text-[11px] tabular-nums sm:inline ${on ? "text-paper/60" : "text-ink-4"}`}>{counts.byLayer[l.id]}</span>
                </a>
              </li>
            );
          })}
        </ol>
      </div>
      <motion.span aria-hidden style={{ scaleX: progress }} className="absolute inset-x-0 -bottom-px h-[2px] origin-left bg-forest" />
    </nav>
  );
}
