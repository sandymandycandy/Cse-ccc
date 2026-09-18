"use client";

import { ArrowUpRight, Mail, Plus } from "lucide-react";
import { motion } from "motion/react";

import type { Member } from "@/data/ccc";
import { Portrait } from "./Portrait";
import { Reveal } from "./Reveal";
import { useCoverPosition, useMembersInLayer, usePresident, useTeam } from "./team-context";

const ease = [0.22, 1, 0.36, 1] as const;

/* ------------------------------------------------------------------------ */
/* Layer 01 — President                                                     */

export function PresidentFeature() {
  const { openProfile } = useTeam();
  const president = usePresident();
  const lines = president.description?.split("\n") ?? [];
  const [lead, ...rest] = lines;
  const quote = rest[0];
  const body = rest.slice(1).join(" ");

  return (
    <div className="mt-12 grid items-center gap-8 lg:mt-16 lg:grid-cols-12 lg:gap-12">
      <Reveal className="lg:col-span-5">
        <button
          type="button"
          onClick={() => openProfile(president.id)}
          aria-label={`Open profile: ${president.name}, President`}
          className="group relative block aspect-[4/5] w-full overflow-hidden rounded-[28px] bg-sand outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-4 focus-visible:ring-offset-paper"
        >
          <Portrait
            member={president}
            preload
            quality={90}
            sizes="(min-width: 1024px) 40vw, 100vw"
            className="transition-transform duration-[1200ms] ease-out-quint group-hover:scale-[1.03]"
          />
          <span className="absolute bottom-4 left-4 right-4 flex items-center justify-between rounded-full border border-white/40 bg-paper/80 py-2 pl-4 pr-2 text-[13px] font-medium text-ink backdrop-blur-md">
            View full profile
            <span className="grid size-8 place-items-center rounded-full bg-ink text-paper transition-transform duration-500 group-hover:rotate-90">
              <Plus className="size-4" />
            </span>
          </span>
        </button>
      </Reveal>

      <Reveal className="lg:col-span-7" delay={0.08}>
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-forest">
          President · Year {president.year} · {president.department}
        </p>
        <h3 className="mt-4 font-serif text-[clamp(2.6rem,5.2vw,4.6rem)] leading-[0.98]">{president.name}</h3>
        {lead && <p className="mt-5 text-[17px] text-ink-2">{lead}</p>}
        {quote && (
          <blockquote className="mt-6 border-l-2 border-forest pl-5 font-serif text-[clamp(1.6rem,2.6vw,2.2rem)] italic leading-[1.15]">
            {quote}
          </blockquote>
        )}
        {body && <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-2">{body}</p>}

        <div className="mt-9 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => openProfile(president.id)}
            className="inline-flex h-12 items-center rounded-full bg-ink px-6 text-[15px] font-medium text-paper transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
          >
            Full profile
          </button>
          {president.portfolio && (
            <a
              href={president.portfolio}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center gap-2 rounded-full border border-line-3 bg-paper-2 px-6 text-[15px] font-medium transition-colors hover:bg-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
            >
              Portfolio <ArrowUpRight className="size-4" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          )}
          <a href={`mailto:${president.email}`} className="inline-flex h-12 items-center gap-2 px-2 text-[15px] font-medium text-ink-2 hover:text-ink">
            <Mail className="size-4" /> Email
          </a>
        </div>
      </Reveal>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Layer 02 — Council leadership                                            */

export function MemberCard({ member, eyebrowClass = "text-clay", index = 0 }: { member: Member; eyebrowClass?: string; index?: number }) {
  const { openProfile } = useTeam();
  const cover = useCoverPosition();
  const meta = [member.year && `Year ${member.year}`, member.department].filter(Boolean).join(" · ");
  return (
    <motion.li
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.8, ease, delay: (index % 3) * 0.07 }}
    >
      <button
        type="button"
        onClick={() => openProfile(member.id)}
        aria-label={`Open profile: ${member.name}, ${member.role}`}
        className="group flex h-full w-full flex-col rounded-[22px] border border-line bg-card p-2 text-left transition-[border-color,transform] duration-500 ease-out-quint hover:-translate-y-1 hover:border-line-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest sm:p-2.5"
      >
        <span className="relative block aspect-[4/5] overflow-hidden rounded-[16px] bg-sand lg:aspect-square">
          <Portrait
            member={member}
            label
            sizes="(min-width: 1024px) 28vw, (min-width: 640px) 45vw, 50vw"
            position={cover(member, 1, 6)}
            className="grayscale-[0.35] transition-[filter,transform] duration-700 ease-out-quint group-hover:scale-[1.03] group-hover:grayscale-0"
          />
        </span>
        <span className="flex flex-1 items-end justify-between gap-3 px-2 pb-2 pt-4 sm:px-3">
          <span className="min-w-0">
            <span className={`block font-mono text-[10px] uppercase tracking-[0.14em] sm:text-[11px] ${eyebrowClass}`}>{member.role}</span>
            <span className="mt-1.5 block font-serif text-[1.35rem] leading-[1.08] [overflow-wrap:anywhere] sm:text-[1.6rem]">{member.name}</span>
            {meta && <span className="mt-1 block text-[13px] text-ink-3">{meta}</span>}
          </span>
          <span className="hidden size-9 shrink-0 place-items-center rounded-full border border-line-3 text-ink transition-all duration-500 group-hover:rotate-90 group-hover:border-ink group-hover:bg-ink group-hover:text-paper sm:grid">
            <Plus className="size-4" />
          </span>
        </span>
      </button>
    </motion.li>
  );
}

export function CouncilGrid() {
  const councilLeaders = useMembersInLayer("council");
  return (
    <ul className="mt-12 grid grid-cols-2 gap-3 sm:gap-5 lg:mt-16 lg:grid-cols-3">
      {councilLeaders.map((m, i) => (
        <MemberCard key={m.id} member={m} index={i} />
      ))}
    </ul>
  );
}
