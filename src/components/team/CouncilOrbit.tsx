"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUpRight } from "lucide-react";

import {
  clubLeaders,
  clubOpenRoles,
  clubs,
  councilLeaders,
  counts,
  getLayer,
  pad,
  president,
  smtByGroup,
  smtMembers,
  type LayerId,
  type Member,
} from "@/data/ccc";
import { Portrait } from "./Portrait";
import { useTeam } from "./TeamProvider";

const ease = [0.22, 1, 0.36, 1] as const;

/* Geometry, in a 1000×1000 plate. */
const RING: Record<LayerId, number> = { president: 0, council: 190, clubs: 305, smt: 415 };
const NODE: Record<LayerId, number> = { president: 156, council: 92, clubs: 80, smt: 66 };
const LABEL_R: Record<LayerId, number> = { president: 104, council: 244, clubs: 356, smt: 458 };
const ORDER: LayerId[] = ["president", "council", "clubs", "smt"];
const COLOR: Record<LayerId, string> = { president: "var(--forest)", council: "var(--clay)", clubs: "var(--ink-2)", smt: "var(--rust)" };

/** Labels short enough to sit inside a club node. */
const PLATE_LABEL: Partial<Record<string, string>> = {
  innovation: "Innov.",
  animatrix: "Anim.",
  cybersentinel: "Cyber",
  "fashion-fusion": "Fashion",
  "short-film": "Film",
};

const councilAngle = (i: number) => -90 + i * 60;
const clubStep = 360 / clubs.length;
const clubAngle = (i: number) => -90 + clubStep / 2 + i * clubStep;
const smtAngle = (i: number) => -90 + i * (360 / smtMembers.length);

/** Rounded so server and browser trig render identical markup. */
function polar(r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  const round = (v: number) => Math.round(v * 100) / 100;
  return { x: round(500 + Math.cos(a) * r), y: round(500 + Math.sin(a) * r) };
}

/** Circle path starting at 9 o'clock and running clockwise, so text reads over the top. */
function arc(r: number) {
  return `M ${500 - r} 500 A ${r} ${r} 0 1 1 ${500 + r} 500 A ${r} ${r} 0 1 1 ${500 - r} 500`;
}

/** 1–4 = one layer in focus, 5 = everyone together. */
type Step = 1 | 2 | 3 | 4 | 5;
type State = "current" | "past" | "future" | "all";

function stateOf(layer: LayerId, step: Step): State {
  if (step === 5) return "all";
  const n = ORDER.indexOf(layer) + 1;
  return n === step ? "current" : n < step ? "past" : "future";
}

type Hover = { title: string; sub: string } | null;

/**
 * "How the council works" as an engraved orbit: the President at the centre,
 * council on the first ring, every club on the second and the Social Media
 * Team circling the outside. Scrolling the story on the left lights up each
 * layer in turn.
 */
export function CouncilOrbit() {
  const [step, setStep] = useState<Step>(1);
  const [hover, setHover] = useState<Hover>(null);
  const storyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      const desktop = window.matchMedia("(min-width: 1024px)").matches;
      const probe = window.innerHeight * (desktop ? 0.55 : 0.86);
      let next: Step = 1;
      storyRef.current?.querySelectorAll<HTMLElement>("[data-orbit-step]").forEach((el, i) => {
        if (el.getBoundingClientRect().top <= probe) next = (i + 1) as Step;
      });
      setStep(next);
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
  }, []);

  return (
    <div className="relative mt-10 grid lg:mt-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
      {/* Plate — sticky under the header on every screen size */}
      <div className="sticky top-[var(--hdr)] z-20 -mx-5 flex flex-col items-center border-b border-line bg-paper-2/95 px-5 pb-3 pt-3 backdrop-blur-md sm:-mx-8 sm:px-8 lg:order-2 lg:mx-0 lg:h-[calc(100svh_-_var(--hdr))] lg:justify-center lg:self-start lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <div className="w-[min(100%,40svh)] lg:w-[min(100%,calc(100svh_-_var(--hdr)_-_9rem))]">
          <Plate step={step} onHover={setHover} />
          <Caption step={step} hover={hover} />
        </div>
      </div>

      {/* Story */}
      <div ref={storyRef} className="lg:order-1">
        <StepBlock active={step === 1} layer="president">
          <PresidentStep />
        </StepBlock>
        <StepBlock active={step === 2} layer="council">
          <CouncilStep />
        </StepBlock>
        <StepBlock active={step === 3} layer="clubs">
          <ClubsStep />
        </StepBlock>
        <StepBlock active={step === 4} layer="smt">
          <SmtStep />
        </StepBlock>
        <Finale active={step === 5} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* The engraved plate                                                       */

function Plate({ step, onHover }: { step: Step; onHover: (h: Hover) => void }) {
  const { openProfile, showClub } = useTeam();

  return (
    // Decorative mirror of the story on the left, which holds the accessible controls.
    <div aria-hidden className="group/plate pointer-events-none relative aspect-square w-full [container-type:inline-size] lg:pointer-events-auto" onPointerLeave={() => onHover(null)}>
      <svg viewBox="0 0 1000 1000" className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          {ORDER.map((l) => (
            <path key={l} id={`orbit-label-${l}`} d={arc(LABEL_R[l])} />
          ))}
        </defs>

        {/* Engraving: frame, ticks, crosshair */}
        <circle cx={500} cy={500} r={497} fill="none" stroke="var(--line-3)" />
        <circle cx={500} cy={500} r={476} fill="none" stroke="var(--line-2)" />
        <g stroke="var(--line-4)">
          {Array.from({ length: 120 }, (_, i) => {
            const long = i % 10 === 0;
            const a = polar(497, i * 3);
            const b = polar(long ? 480 : 489, i * 3);
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={long ? 1.6 : 0.8} />;
          })}
        </g>
        <g stroke="var(--line-2)" strokeDasharray="2 9">
          <line x1={500} y1={24} x2={500} y2={976} />
          <line x1={24} y1={500} x2={976} y2={500} />
        </g>

        {/* Spokes: President → council, President → each club */}
        {councilLeaders.map((_, i) => {
          const a = polar(86, councilAngle(i));
          const b = polar(RING.council - NODE.council / 2 - 6, councilAngle(i));
          const s = stateOf("council", step);
          return (
            <motion.path
              key={`cs${i}`}
              d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`}
              stroke={s === "current" ? COLOR.council : "var(--line-4)"}
              strokeWidth={s === "current" ? 2 : 1}
              initial={false}
              animate={{ pathLength: s === "future" ? 0 : 1, opacity: s === "future" ? 0 : 1 }}
              transition={{ duration: 0.7, ease, delay: s === "current" ? i * 0.05 : 0 }}
            />
          );
        })}
        {clubs.map((_, i) => {
          const a = polar(86, clubAngle(i));
          const b = polar(RING.clubs - NODE.clubs / 2 - 6, clubAngle(i));
          const s = stateOf("clubs", step);
          return (
            <path
              key={`ks${i}`}
              d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`}
              strokeDasharray="4 6"
              style={{
                stroke: s === "current" ? COLOR.clubs : "var(--line-3)",
                strokeWidth: s === "current" ? 1.6 : 1,
                opacity: s === "future" ? 0 : 1,
                transition: `opacity .6s ${s === "current" ? i * 0.03 : 0}s, stroke .5s`,
              }}
            />
          );
        })}

        {/* Rings */}
        {ORDER.slice(1).map((l) => {
          const s = stateOf(l, step);
          return (
            <circle
              key={l}
              cx={500}
              cy={500}
              r={RING[l]}
              fill="none"
              strokeDasharray={l === "smt" ? "3 8" : undefined}
              style={{
                stroke: s === "current" ? COLOR[l] : "var(--line-3)",
                strokeWidth: s === "current" ? 2.2 : 1,
                opacity: s === "future" ? 0.35 : 1,
                transition: "stroke .5s, stroke-width .5s, opacity .5s",
              }}
            />
          );
        })}

        {/* Ring captions, set along each orbit */}
        {ORDER.map((l) => {
          const s = stateOf(l, step);
          const meta = getLayer(l);
          const n = counts.byLayer[l];
          return (
            <text
              key={l}
              fontSize={l === "president" ? 12 : 14}
              letterSpacing={l === "president" ? 2.5 : 3.5}
              style={{
                fontFamily: "var(--mono)",
                fill: s === "current" ? COLOR[l] : "var(--ink-3)",
                opacity: s === "future" ? 0.25 : 1,
                transition: "fill .5s, opacity .5s",
              }}
            >
              <textPath href={`#orbit-label-${l}`} startOffset={l === "president" ? "6%" : "4%"}>
                {`${pad(meta.number)} · ${meta.title.toUpperCase()} · ${n}`}
              </textPath>
            </text>
          );
        })}
      </svg>

      {/* Clubs */}
      {clubs.map((c, i) => {
        const s = stateOf("clubs", step);
        const n = clubLeaders(c.id).length;
        const open = clubOpenRoles(c.id).length;
        const sub = [`Club ${pad(c.number)}`, n ? `${n} leaders` : null, open ? `${open} open` : null].filter(Boolean).join(" · ");
        return (
          <Place key={c.id} r={RING.clubs} deg={clubAngle(i)} d={NODE.clubs}>
            <Reveal state={s} delay={i * 0.035}>
              <button
                type="button"
                tabIndex={-1}
                onClick={() => showClub(c.id, true)}
                onPointerEnter={() => onHover({ title: c.name, sub })}
                className="group relative grid size-full place-items-center rounded-full bg-paper leading-none transition-[box-shadow,transform] duration-300 hover:scale-110"
                style={{ boxShadow: `inset 0 0 0 ${s === "current" ? 2 : 1}px ${s === "current" ? "var(--ink-2)" : "var(--line-3)"}` }}
              >
                {/* A club still recruiting wears a dashed collar. */}
                {open > 0 && <span className="pointer-events-none absolute inset-[-7%] rounded-full border border-dashed border-line-4" />}
                <span className="grid place-items-center">
                  <span className="font-serif text-[3.2cqw] leading-none">{pad(c.number)}</span>
                  <span className="mt-[0.4cqw] hidden font-mono text-[1.1cqw] uppercase tracking-[0.04em] text-ink-3 @min-[420px]:block">{PLATE_LABEL[c.id] ?? c.short}</span>
                </span>
              </button>
            </Reveal>
          </Place>
        );
      })}

      {/* Council */}
      {councilLeaders.map((m, i) => (
        <Place key={m.id} r={RING.council} deg={councilAngle(i)} d={NODE.council}>
          <Face member={m} layer="council" state={stateOf("council", step)} delay={i * 0.05} sizes="72px" onOpen={openProfile} onHover={onHover} />
        </Place>
      ))}

      {/* President */}
      <Place r={0} deg={0} d={NODE.president}>
        <Face member={president} layer="president" state={stateOf("president", step)} delay={0} sizes="160px" onOpen={openProfile} onHover={onHover} />
        {stateOf("president", step) === "current" && (
          <motion.span
            key={`pulse-${step}`}
            className="pointer-events-none absolute inset-0 rounded-full border-2 border-forest"
            initial={{ scale: 1, opacity: 0.6 }}
            animate={{ scale: 1.45, opacity: 0 }}
            transition={{ duration: 2, ease: "easeOut", repeat: 2 }}
          />
        )}
      </Place>

      {/* SMT — a slow orbit that pauses while you look */}
      <div className="absolute inset-0 motion-safe:animate-[orbit-spin_180s_linear_infinite] group-hover/plate:[animation-play-state:paused]">
        {smtMembers.map((m, i) => (
          <Place key={m.id} r={RING.smt} deg={smtAngle(i)} d={NODE.smt}>
            <div className="size-full motion-safe:animate-[orbit-spin_180s_linear_infinite_reverse] group-hover/plate:[animation-play-state:paused]">
              <Face member={m} layer="smt" state={stateOf("smt", step)} delay={i * 0.04} sizes="56px" onOpen={openProfile} onHover={onHover} />
            </div>
          </Place>
        ))}
      </div>
    </div>
  );
}

function Place({ r, deg, d, children }: { r: number; deg: number; d: number; children: React.ReactNode }) {
  const p = polar(r, deg);
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${(p.x / 10).toFixed(3)}%`, top: `${(p.y / 10).toFixed(3)}%`, width: `${d / 10}%`, height: `${d / 10}%` }}>
      {children}
    </div>
  );
}

const visual: Record<State, { opacity: number; scale: number }> = {
  current: { opacity: 1, scale: 1 },
  all: { opacity: 1, scale: 1 },
  past: { opacity: 0.55, scale: 0.9 },
  future: { opacity: 0.1, scale: 0.55 },
};

function Reveal({ state, delay, children }: { state: State; delay: number; children: React.ReactNode }) {
  return (
    <motion.div
      className="size-full"
      initial={false}
      animate={visual[state]}
      transition={{ duration: 0.6, ease, delay: state === "current" ? delay : 0 }}
      style={{ pointerEvents: state === "future" ? "none" : "auto" }}
    >
      {children}
    </motion.div>
  );
}

function Face({
  member,
  layer,
  state,
  delay,
  sizes,
  onOpen,
  onHover,
}: {
  member: Member;
  layer: LayerId;
  state: State;
  delay: number;
  sizes: string;
  onOpen: (id: string) => void;
  onHover: (h: Hover) => void;
}) {
  const lit = state === "current" || state === "all";
  return (
    <Reveal state={state} delay={delay}>
      <button
        type="button"
        tabIndex={-1}
        onClick={() => onOpen(member.id)}
        onPointerEnter={() => onHover({ title: member.name, sub: member.role })}
        aria-label={`${member.name}, ${member.role}`}
        className="group relative block size-full rounded-full"
      >
        <span
          className="absolute inset-0 overflow-hidden rounded-full bg-sand transition-[filter,box-shadow,transform] duration-500 group-hover:scale-110"
          style={{
            boxShadow: `0 0 0 ${state === "current" ? 2.5 : 1}px ${state === "current" ? COLOR[layer] : "var(--line-3)"}, 0 0 0 5px var(--paper-2)`,
            filter: lit ? "none" : "grayscale(1)",
          }}
        >
          <Portrait member={member} sizes={sizes} />
        </span>
      </button>
    </Reveal>
  );
}

function Caption({ step, hover }: { step: Step; hover: Hover }) {
  const layer = step === 5 ? null : ORDER[step - 1];
  const meta = layer ? getLayer(layer) : null;
  return (
    <div aria-hidden className="mt-2 flex items-center gap-4 border-t border-line pt-3 lg:mt-6 lg:pt-5">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={step}
          initial={{ y: "60%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-60%", opacity: 0 }}
          transition={{ duration: 0.35, ease }}
          className="w-[2.2ch] shrink-0 font-serif text-[2.2rem] leading-none lg:text-[3.2rem]"
          style={{ color: layer ? COLOR[layer] : "var(--ink)" }}
        >
          {step === 5 ? counts.people : pad(step)}
        </motion.span>
      </AnimatePresence>
      <div className="min-w-0">
        <p className="truncate font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3 lg:text-[11px]">
          {hover ? hover.sub : meta ? `${meta.label} · ${counts.byLayer[meta.id]} ${counts.byLayer[meta.id] === 1 ? "person" : "people"}` : "All four layers"}
        </p>
        <p className="mt-1 truncate font-serif text-[1.15rem] leading-tight lg:text-[1.5rem]">
          {hover ? hover.title : meta ? meta.title : "One council"}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* The story                                                                */

const titles: Record<LayerId, React.ReactNode> = {
  president: (
    <>
      At the centre, <em className="text-forest">the President.</em>
    </>
  ),
  council: (
    <>
      Around them, <em className="text-clay">the council.</em>
    </>
  ),
  clubs: (
    <>
      Then, <em>{counts.clubs} clubs.</em>
    </>
  ),
  smt: (
    <>
      And circling it all, <em className="text-rust">the SMT.</em>
    </>
  ),
};

function StepBlock({
  active,
  layer,
  children,
}: {
  active: boolean;
  layer: LayerId;
  children: React.ReactNode;
}) {
  const meta = getLayer(layer);
  const n = counts.byLayer[layer];
  return (
    <article
      data-orbit-step
      aria-labelledby={`orbit-step-${layer}`}
      className={`flex min-h-[64svh] flex-col justify-center py-12 transition-opacity duration-500 lg:min-h-[82svh] lg:py-16 ${active ? "" : "lg:opacity-30"}`}
    >
      <p className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">
        <span
          aria-hidden
          className="font-serif text-[4.2rem] leading-[0.8] tracking-normal text-transparent [-webkit-text-stroke:1px_var(--line-4)] lg:text-[5.5rem]"
        >
          {pad(meta.number)}
        </span>
        <span>
          {meta.label} · {n} {n === 1 ? "person" : "people"}
        </span>
      </p>
      <h3 id={`orbit-step-${layer}`} className="mt-5 font-serif text-[clamp(2.2rem,3.8vw,3.4rem)] leading-[1.02]">
        {titles[layer]}
      </h3>
      <p className="mt-4 max-w-lg text-[17px] leading-relaxed text-ink-2">{meta.summary}</p>
      <div className="mt-7">{children}</div>
    </article>
  );
}

function PresidentStep() {
  const { openProfile } = useTeam();
  return (
    <button
      type="button"
      onClick={() => openProfile(president.id)}
      className="group flex w-full max-w-md items-center gap-4 rounded-2xl border border-line bg-card p-3 pr-5 text-left transition-colors hover:border-line-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
    >
      <span className="relative size-16 shrink-0 overflow-hidden rounded-full bg-sand">
        <Portrait member={president} sizes="64px" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-serif text-[1.35rem] leading-tight">{president.name}</span>
        <span className="mt-0.5 block text-[13px] text-ink-3">
          Year {president.year} · {president.department}
        </span>
      </span>
      <ArrowUpRight className="size-4 shrink-0 text-ink-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" />
    </button>
  );
}

function CouncilStep() {
  const { openProfile } = useTeam();
  return (
    <ul className="grid gap-x-6 sm:grid-cols-2">
      {councilLeaders.map((m) => (
        <li key={m.id} className="border-b border-line">
          <button
            type="button"
            onClick={() => openProfile(m.id)}
            className="group flex w-full items-center gap-3 py-3 text-left focus-visible:outline-2 focus-visible:outline-forest"
          >
            <span className="relative size-10 shrink-0 overflow-hidden rounded-full bg-sand">
              <Portrait member={m} sizes="40px" />
            </span>
            <span className="min-w-0">
              <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-clay">{m.role}</span>
              <span className="block truncate text-[15px] transition-colors group-hover:text-forest">{m.name}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ClubsStep() {
  const { showClub } = useTeam();
  return (
    <>
      <ul className="flex flex-wrap gap-2">
        {clubs.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => showClub(c.id, true)}
              className="flex h-11 items-center gap-2 rounded-full border border-line-3 bg-card px-3.5 text-[14px] text-ink-2 transition-colors hover:border-ink hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest lg:h-9"
            >
              <span className="font-mono text-[11px] tabular-nums text-ink-4">{pad(c.number)}</span>
              {c.short}
              {c.isNew && <span className="rounded-full bg-forest-tint px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-forest">New</span>}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
        Select a club to meet its Heads and Vice Heads
        {counts.openRoles > 0 && ` · ${counts.openRoles} positions being recruited`}
      </p>
    </>
  );
}

function SmtStep() {
  const { openProfile } = useTeam();
  return (
    <dl className="divide-y divide-line border-y border-line">
      {smtByGroup().map((g) => (
        <div key={g.group} className="grid gap-1 py-3 sm:grid-cols-[9.5rem_1fr] sm:gap-4">
          <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-rust">{g.group}</dt>
          <dd className="flex flex-wrap gap-x-3 gap-y-1 text-[15px]">
            {g.members.map((m, i) => (
              <span key={m.id}>
                <button type="button" onClick={() => openProfile(m.id)} className="underline decoration-line-4 underline-offset-4 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-forest">
                  {m.name}
                </button>
                {i < g.members.length - 1 && <span className="text-ink-4">,</span>}
              </span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Finale({ active }: { active: boolean }) {
  return (
    <article
      data-orbit-step
      aria-labelledby="orbit-finale"
      className={`flex min-h-[56svh] flex-col justify-center py-12 transition-opacity duration-500 lg:min-h-[70svh] ${active ? "" : "lg:opacity-30"}`}
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">All four layers · {counts.people} people</p>
      <h3 id="orbit-finale" className="mt-5 font-serif text-[clamp(2.6rem,4.6vw,4.2rem)] leading-[0.98]">
        Four layers. <em className="text-forest">One council.</em>
      </h3>
      <p className="mt-4 max-w-md text-[17px] leading-relaxed text-ink-2">
        {counts.people} students, {counts.clubs} clubs — and every one of them is a click away below.
      </p>
      <a
        href="#president"
        className="mt-8 inline-flex h-12 w-fit items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-medium text-paper transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
      >
        Meet them, layer by layer <ArrowDown className="size-4" />
      </a>
    </article>
  );
}
