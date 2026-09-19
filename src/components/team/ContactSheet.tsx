"use client";

import { useMemo, useState } from "react";

import { clubs, getClub, layers, pad, type LayerId, type Member } from "@/data/ccc";
import { selectClubLeaders, selectInLayer, selectPresident } from "@/lib/team/selectors";
import { Portrait } from "./Portrait";
import { useCoverPosition, useMembers, useTeam } from "./team-context";

/**
 * The whole council on one roll, in hierarchy order: President → council → club
 * leaders → SMT.
 *
 * This used to be a module-level constant. A module constant is built once,
 * before React runs, from the file alone — so it could never show an edit
 * made in /admin/team. It is now built from the merged list. The pure
 * selectors are used because clubs.flatMap() is a loop, where hooks cannot go.
 */
function useEveryone(): Member[] {
  const members = useMembers();
  return useMemo(
    () => [
      selectPresident(members)!,
      ...selectInLayer(members, "council"),
      ...clubs.flatMap((c) => selectClubLeaders(members, c.id)),
      ...selectInLayer(members, "smt"),
    ],
    [members],
  );
}

const FILM = "#15160f";
const PENCIL = "#e2553a";

/** Layer marks, tuned to read on dark film. */
const filmTone: Record<LayerId, string> = {
  president: "#8fbb9c",
  council: "#d2a16b",
  clubs: "#c9ccbf",
  smt: "#e08a78",
};

function chunk<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));
}

/**
 * A photographer's contact sheet of every student on the council. Frames print
 * in black and white; hovering or focusing one develops it to colour and circles
 * it in grease pencil. Any frame opens that person's profile.
 */
export function ContactSheet() {
  const everyone = useEveryone();
  const [active, setActive] = useState<number | null>(null);
  const person = active === null ? null : everyone[active];

  return (
    <figure className="relative min-w-0 pt-10 sm:pt-12">
      <p
        aria-hidden
        className="rise pointer-events-none absolute right-3 top-0 z-10 rotate-[-4deg] font-serif text-[1.35rem] italic leading-none sm:text-[1.7rem]"
        style={{ color: PENCIL, "--delay": "1100ms" } as React.CSSProperties}
      >
        one roll, {everyone.length} frames
      </p>

      <div
        // Full-bleed on phones: the extra 40px keeps every frame a comfortable tap target.
        className="relative -mx-5 px-2 py-1 shadow-[0_40px_70px_-35px_rgba(34,36,31,0.6)] ring-1 ring-black/10 transition-transform duration-700 ease-out-quint night:ring-white/10 sm:mx-0 sm:rounded-[14px] sm:px-2.5 lg:rotate-[-1.2deg] lg:hover:rotate-0"
        style={{ background: FILM }}
      >
        <Sheet cols={6} className="sm:hidden" onActive={setActive} />
        <Sheet cols={9} className="hidden sm:block" onActive={setActive} />
      </div>

      <figcaption aria-hidden className="mt-6 flex min-h-[3.2rem] flex-col gap-1 border-b border-line pb-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
        <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">
          {person ? `Frame ${pad((active ?? 0) + 1)}` : "Contact sheet · CCC"}
        </span>
        <span className="min-w-0 truncate text-[15px] text-ink-2 sm:text-right">
          {person ? (
            <>
              <span className="font-serif text-[1.2rem] text-ink">{person.name}</span> — {person.role}
              {person.club ? `, ${getClub(person.club).short}` : ""}
            </>
          ) : (
            "Every student on the council. Pick a frame."
          )}
        </span>
      </figcaption>

      <ul aria-label="Colour key" className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        {layers.map((l) => (
          <li key={l.id} className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">
            <span className="size-2 rounded-full ring-1 ring-black/10" style={{ background: filmTone[l.id] }} />
            {l.short}
          </li>
        ))}
      </ul>
    </figure>
  );
}

function Sheet({ cols, className, onActive }: { cols: number; className: string; onActive: (i: number | null) => void }) {
  const everyone = useEveryone();
  const strips = chunk(
    everyone.map((member, index) => ({ member, index })),
    cols,
  );
  return (
    <div role="list" aria-label="Everyone on the team" data-cols={cols} className={className}>
      {strips.map((strip, r) => (
        <div
          key={r}
          role="presentation"
          className="relative pb-[34px] pt-[22px]"
          // "backwards" fill: clipped before and during the reveal, no clip-path left behind afterwards.
          style={{ animation: `${r % 2 ? "film-in-rev" : "film-in"} 1.1s var(--ease-out-expo) backwards`, animationDelay: `${200 + r * 120}ms` }}
        >
          <Sprockets className="top-[6px]" />
          <Sprockets className="bottom-[6px]" />
          <div className="grid gap-[5px] px-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {strip.map(({ member, index }) => (
              <Frame key={member.id} member={member} index={index} onActive={onActive} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Sprockets({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={`absolute inset-x-2 h-[6px] opacity-80 ${className}`}
      style={{ backgroundImage: "linear-gradient(90deg, #efede4 0 8px, transparent 8px 17px)", backgroundSize: "17px 6px" }}
    />
  );
}

function Frame({ member, index, onActive }: { member: Member; index: number; onActive: (i: number | null) => void }) {
  const { openProfile } = useTeam();
  const cover = useCoverPosition();
  const circled = member.layer === "president";
  return (
    <div role="listitem" className="group relative">
      <button
        type="button"
        onClick={() => openProfile(member.id)}
        onPointerEnter={() => onActive(index)}
        onPointerLeave={() => onActive(null)}
        onFocus={() => onActive(index)}
        onBlur={() => onActive(null)}
        aria-label={`${member.name}, ${member.role}${member.club ? `, ${getClub(member.club).name}` : ""}`}
        className="relative block aspect-[4/5] w-full overflow-hidden rounded-[2px] bg-[#2b2c25] outline-none focus-visible:ring-2 focus-visible:ring-[#e0a458] focus-visible:ring-offset-2 focus-visible:ring-offset-[#15160f]"
      >
        <Portrait
          member={member}
          tone="film"
          sizes="(min-width: 640px) 64px, 16vw"
          position={cover(member, 4 / 5)}
          className="transition-[filter,transform] duration-500 ease-out-quint group-hover:scale-[1.08] group-hover:grayscale-0 group-focus-within:grayscale-0 pointer-fine:contrast-[1.08] pointer-fine:grayscale"
        />
      </button>

      {/* Grease-pencil circle */}
      <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute -inset-x-[24%] -inset-y-[15%] z-10 h-[130%] w-[148%] overflow-visible">
        <path
          d="M55 5 C 84 3, 99 25, 97 51 C 95 81, 73 98, 46 96 C 17 93, 2 73, 4 47 C 6 20, 25 4, 61 9"
          pathLength={1}
          fill="none"
          stroke={PENCIL}
          strokeWidth={2.6}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className={`[stroke-dasharray:1] transition-[stroke-dashoffset] duration-700 ease-out-quint ${
            circled ? "[stroke-dashoffset:0]" : "[stroke-dashoffset:1] group-focus-within:[stroke-dashoffset:0] group-hover:[stroke-dashoffset:0]"
          }`}
        />
      </svg>

      {/* Layer mark only. The frame numbers that used to print beside it read as
          clutter at this size; the frame's identity is in the caption on hover. */}
      <span aria-hidden className="absolute -bottom-[15px] left-0.5 flex items-center gap-1 leading-none">
        <span className="size-[5px] rounded-full" style={{ background: filmTone[member.layer] }} />
      </span>
    </div>
  );
}
