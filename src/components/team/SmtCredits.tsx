"use client";

import { motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";

import type { SmtGroup } from "@/data/ccc";
import { Portrait } from "./Portrait";
import { useCoverPosition, useMembersInLayer, useSmtByGroup, useTeam } from "./team-context";
import { smtTone } from "./tones";

const ease = [0.22, 1, 0.36, 1] as const;

function slug(group: SmtGroup) {
  return `smt-${group.toLowerCase().replace(/[^a-z]+/g, "-")}`;
}

/** Layer 04: how the Social Media Team splits across functions, then the people in each. */
export function SmtCredits() {
  const { openProfile } = useTeam();
  const groups = useSmtByGroup();
  const smtMembers = useMembersInLayer("smt");
  const cover = useCoverPosition();

  return (
    <div className="mt-12 lg:mt-16">
      {/* Composition bar */}
      <div className="rounded-[24px] border border-line bg-card p-5 sm:p-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">{smtMembers.length} people · {groups.length} functions</p>
        <div className="mt-4 flex h-3 gap-1 overflow-hidden rounded-full" aria-hidden>
          {groups.map((g, i) => (
            <motion.span
              key={g.group}
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.9, ease, delay: i * 0.06 }}
              className={`h-full origin-left rounded-full ${smtTone[g.group]}`}
              style={{ flexGrow: g.members.length, flexBasis: 0 }}
            />
          ))}
        </div>
        <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          {groups.map((g) => (
            <li key={g.group}>
              <a href={`#${slug(g.group)}`} className="flex items-center gap-2 text-[14px] text-ink-2 hover:text-ink">
                <span className={`size-2 rounded-full ${smtTone[g.group]}`} />
                {g.group}
                <span className="font-mono text-[12px] tabular-nums text-ink-4">{g.members.length}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((g, gi) => (
          <motion.section
            key={g.group}
            id={slug(g.group)}
            aria-labelledby={`${slug(g.group)}-title`}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.7, ease, delay: (gi % 3) * 0.06 }}
            className="scroll-mt-[calc(var(--hdr)_+_81px)] rounded-[24px] border border-line bg-card p-3"
          >
            <h3 id={`${slug(g.group)}-title`} className="flex items-center justify-between px-3 pb-2 pt-2">
              <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-2">
                <span className={`size-2 rounded-full ${smtTone[g.group]}`} />
                {g.group}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-ink-4">{String(g.members.length).padStart(2, "0")}</span>
            </h3>
            <ul>
              {g.members.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => openProfile(m.id)}
                    aria-label={`Open profile: ${m.name}, ${m.role}`}
                    className="group grid w-full grid-cols-[56px_1fr_auto] items-center gap-3.5 rounded-[16px] p-2 text-left transition-colors hover:bg-sand focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-forest"
                  >
                    <span className="relative block aspect-square overflow-hidden rounded-[12px] bg-sand">
                      <Portrait member={m} sizes="56px" position={cover(m, 1, 4)} />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-serif text-[1.2rem] leading-[1.15] [overflow-wrap:anywhere]">{m.name}</span>
                      <span className="mt-0.5 block text-[13px] text-ink-3">{m.role}</span>
                    </span>
                    <ArrowUpRight className="size-4 text-ink-4 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" />
                  </button>
                </li>
              ))}
            </ul>
          </motion.section>
        ))}
      </div>
    </div>
  );
}
