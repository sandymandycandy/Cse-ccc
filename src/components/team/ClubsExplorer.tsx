"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Plus, UserPlus } from "lucide-react";

import {
  clubOpenRoles,
  clubs,
  counts,
  getClub,
  isHeadRole,
  pad,
  type ClubId,
  type Member,
  type OpenRole,
} from "@/data/ccc";
import { siteHref } from "@/lib/site";
import { selectClubLeaders } from "@/lib/team/selectors";
import { Portrait } from "./Portrait";
import { useClubLeaders, useCoverPosition, useMembers, useTeam } from "./team-context";

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * Layer 03: a tab list of every club beside a panel showing the selected club's
 * leadership. Arrow keys move between clubs. Positions that haven't been filled
 * yet appear as marked-open slots next to the people already in post.
 */
export function ClubsExplorer() {
  const { club, showClub } = useTeam();
  // The tab list runs inside clubs.map(), where a per-club hook cannot be
  // called — so it filters the merged list with the pure selector instead.
  const members = useMembers();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Keep the active chip visible in the mobile scroller.
  useEffect(() => {
    const chip = chipRefs.current[club];
    const scroller = chip?.parentElement?.parentElement;
    if (!chip || !scroller || scroller.scrollWidth <= scroller.clientWidth) return;
    scroller.scrollTo({ left: chip.offsetLeft - scroller.clientWidth / 2 + chip.offsetWidth / 2, behavior: "smooth" });
  }, [club]);

  const onKeyDown = (e: React.KeyboardEvent, refs: typeof tabRefs) => {
    const i = clubs.findIndex((c) => c.id === club);
    const keys: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    let next: number | null = null;
    if (e.key in keys) next = (i + keys[e.key] + clubs.length) % clubs.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = clubs.length - 1;
    if (next === null) return;
    e.preventDefault();
    showClub(clubs[next].id);
    refs.current[clubs[next].id]?.focus();
  };

  return (
    <div className="mt-12 grid items-start gap-6 lg:mt-16 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:gap-10">
      {/* Mobile / tablet: horizontal chips */}
      <div className="no-scrollbar -mx-5 overflow-x-auto px-5 sm:-mx-8 sm:px-8 lg:hidden">
        <div role="tablist" aria-label="Clubs" aria-orientation="horizontal" className="flex w-max gap-2 pb-1">
          {clubs.map((c) => {
            const on = c.id === club;
            return (
              <button
                key={c.id}
                ref={(el) => {
                  chipRefs.current[c.id] = el;
                }}
                role="tab"
                id={`club-chip-${c.id}`}
                aria-selected={on}
                aria-controls="club-panel"
                tabIndex={on ? 0 : -1}
                onClick={() => showClub(c.id)}
                onKeyDown={(e) => onKeyDown(e, chipRefs)}
                className={`flex h-11 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-[14px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest sm:h-10 ${
                  on ? "border-ink bg-ink text-paper" : "border-line-3 bg-paper-2 text-ink-2"
                }`}
              >
                <span className={`font-mono text-[11px] tabular-nums ${on ? "text-paper/60" : "text-ink-4"}`}>{pad(c.number)}</span>
                {c.short}
                {c.isNew && (
                  <span className={`rounded-full px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] ${on ? "bg-paper/20 text-paper" : "bg-forest-tint text-forest"}`}>
                    New
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop: vertical index */}
      <div role="tablist" aria-label="Clubs" aria-orientation="vertical" className="hidden border-t border-line lg:block">
        {clubs.map((c) => {
          const on = c.id === club;
          const leaders = selectClubLeaders(members, c.id);
          const open = clubOpenRoles(c.id);
          return (
            <button
              key={c.id}
              ref={(el) => {
                tabRefs.current[c.id] = el;
              }}
              role="tab"
              id={`club-tab-${c.id}`}
              aria-selected={on}
              aria-controls="club-panel"
              tabIndex={on ? 0 : -1}
              onClick={() => showClub(c.id)}
              onKeyDown={(e) => onKeyDown(e, tabRefs)}
              className="group relative grid w-full grid-cols-[2.25rem_1fr_auto] items-center gap-3 border-b border-line py-3.5 pl-4 pr-3 text-left outline-none focus-visible:bg-sand"
            >
              {on && <motion.span layoutId="club-tab-active" className="absolute inset-0 rounded-xl bg-sand" transition={{ type: "spring", stiffness: 400, damping: 38 }} />}
              {on && <motion.span layoutId="club-tab-bar" className="absolute bottom-3 left-0 top-3 w-[3px] rounded-full bg-forest" transition={{ type: "spring", stiffness: 400, damping: 38 }} />}
              <span className={`relative font-mono text-[11px] tabular-nums ${on ? "text-forest" : "text-ink-4"}`}>{pad(c.number)}</span>
              <span className={`relative flex min-w-0 items-center gap-2 transition-colors ${on ? "font-medium text-ink" : "text-ink-2 group-hover:text-ink"}`}>
                <span className="truncate text-[16px]">{c.name}</span>
                {c.isNew && <span className="shrink-0 rounded-full bg-forest-tint px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-forest">New</span>}
              </span>
              <span className="relative flex -space-x-1.5">
                {leaders.slice(0, 3).map((m) => (
                  <span key={m.id} className="relative size-6 overflow-hidden rounded-full border-2 border-paper bg-sand">
                    <Portrait member={m} sizes="24px" />
                  </span>
                ))}
                {/* Unfilled positions keep their place in the line-up. */}
                {open.slice(0, 3 - Math.min(leaders.length, 3)).map((r) => (
                  <span key={r.id} className="size-6 rounded-full border-2 border-paper bg-paper">
                    <span className="block size-full rounded-full border border-dashed border-line-4" />
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="lg:sticky lg:top-[calc(var(--hdr)_+_81px)]">
        <AnimatePresence mode="wait" initial={false}>
          <ClubPanel key={club} clubId={club} />
        </AnimatePresence>
      </div>
    </div>
  );
}

function ClubPanel({ clubId }: { clubId: ClubId }) {
  const club = getClub(clubId);
  const leaders = useClubLeaders(clubId);
  const open = clubOpenRoles(clubId);
  // Heads first, then Vice Heads, all side by side; open positions bring up the rear.
  const ordered = [...leaders.filter((m) => isHeadRole(m.role)), ...leaders.filter((m) => !isHeadRole(m.role))];
  const slots = ordered.length + open.length;
  // A club whose leadership is still being recruited keeps its empty frames modest.
  const cols = !ordered.length
    ? "max-w-xl grid-cols-2"
    : slots >= 4
      ? "grid-cols-2 xl:grid-cols-4"
      : slots === 3
        ? "grid-cols-2 sm:grid-cols-3"
        : "grid-cols-2";
  const pair = slots === 2 && ordered.length > 0;
  const meta = [
    `Club ${pad(club.number)} of ${counts.clubs}`,
    leaders.length ? `${leaders.length} ${leaders.length === 1 ? "leader" : "leaders"}` : null,
    open.length ? `${open.length} open` : null,
    club.memberCount ? `${club.memberCount} members` : null,
  ].filter(Boolean);

  return (
    <motion.section
      id="club-panel"
      role="tabpanel"
      aria-labelledby={`club-tab-${clubId}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.35, ease }}
      className="rounded-[28px] border border-line bg-card p-5 sm:p-8"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">
            {meta.join(" · ")}
            {club.isNew && <span className="rounded-full bg-forest-tint px-2 py-0.5 tracking-[0.1em] text-forest">New club</span>}
          </p>
          <h3 className="mt-2 font-serif text-[clamp(2.1rem,4vw,3.2rem)] leading-[1]">{club.name}</h3>
          <p className="mt-2 font-serif text-[1.25rem] italic text-ink-2">{club.tagline}</p>
        </div>
        {club.siteSlug && (
          <a
            href={siteHref(`/clubs/${club.siteSlug}`)}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-line-3 bg-paper-2 px-4 text-[14px] font-medium transition-colors hover:bg-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
          >
            Club page <ArrowUpRight className="size-4" />
          </a>
        )}
      </div>

      {club.about && <p className="mt-6 max-w-3xl border-t border-line pt-6 text-[16px] leading-relaxed text-ink-2">{club.about}</p>}

      <ul className={`mt-7 grid gap-3 border-t border-line pt-7 sm:gap-5 ${cols}`}>
        {ordered.map((m, i) => (
          <LeaderCard key={m.id} member={m} delay={0.08 + i * 0.07} pair={pair} />
        ))}
        {open.map((r, i) => (
          <OpenSlot key={r.id} role={r} delay={0.08 + (ordered.length + i) * 0.07} pair={pair} />
        ))}
      </ul>

      {open.length > 0 && (
        <p className="mt-6 font-mono text-[11px] uppercase leading-relaxed tracking-[0.14em] text-ink-3">
          {open.length === 1 ? "One position is" : `${open.length} positions are`} being recruited — the frames fill in once the club announces who&rsquo;s taking them.
        </p>
      )}
    </motion.section>
  );
}

/**
 * A position that is still being recruited for. Same footprint as a leader card,
 * but drawn as an empty frame so it reads as a held place, not a person.
 */
function OpenSlot({ role, delay, pair }: { role: OpenRole; delay: number; pair: boolean }) {
  return (
    <motion.li initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease, delay }}>
      <div className="flex h-full w-full flex-col">
        <span
          className={`relative block aspect-[4/5] w-full overflow-hidden rounded-[20px] border border-dashed border-line-4 bg-paper-2 ${pair ? "lg:aspect-square" : ""}`}
        >
          <span
            aria-hidden
            className="absolute inset-0 opacity-[0.55]"
            style={{ backgroundImage: "repeating-linear-gradient(-45deg, var(--line-2) 0 1px, transparent 1px 9px)" }}
          />
          <span className="absolute inset-0 grid place-items-center [container-type:inline-size]">
            <span className="grid place-items-center gap-2 text-center">
              <span className="grid size-[18cqw] min-h-9 min-w-9 place-items-center rounded-full border border-dashed border-line-4 bg-paper text-ink-3">
                <UserPlus className="size-[9cqw] min-h-4 min-w-4" strokeWidth={1.5} />
              </span>
              <span className="font-mono text-[clamp(9px,3cqw,11px)] uppercase tracking-[0.14em] text-ink-3">Hiring</span>
            </span>
          </span>
          <span className="absolute left-2 top-2 max-w-[calc(100%-1rem)] truncate rounded-full border border-dashed border-line-4 bg-paper/85 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-2 backdrop-blur-md sm:left-3 sm:top-3 sm:px-2.5 sm:py-1 sm:text-[10px] sm:tracking-[0.14em]">
            {role.role}
          </span>
        </span>
        <span className="mt-3.5 block px-1 font-serif text-[clamp(1.15rem,1.7vw,1.5rem)] italic leading-[1.12] text-ink-3">Position open</span>
        <span className="mt-1 block px-1 text-[13px] text-ink-3">{role.note ?? "To be announced"}</span>
      </div>
    </motion.li>
  );
}

/** A leader as a large portrait card; the whole card opens their profile. */
function LeaderCard({ member, delay, pair }: { member: Member; delay: number; pair: boolean }) {
  const { openProfile } = useTeam();
  const cover = useCoverPosition();
  const head = isHeadRole(member.role);
  const meta = [member.year && `Year ${member.year}`, member.department].filter(Boolean).join(" · ");
  return (
    <motion.li initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease, delay }}>
      <button
        type="button"
        onClick={() => openProfile(member.id)}
        aria-label={`Open profile: ${member.name}, ${member.role}`}
        className="group flex h-full w-full flex-col text-left outline-none focus-visible:rounded-[20px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest"
      >
        {/* Two leaders get wide cards, so they go square on desktop to stay within the viewport. */}
        <span className={`relative block aspect-[4/5] w-full overflow-hidden rounded-[20px] bg-sand ${pair ? "lg:aspect-square" : ""}`}>
          <Portrait
            member={member}
            sizes={pair ? "(min-width: 1024px) 30vw, 45vw" : "(min-width: 1280px) 22vw, (min-width: 1024px) 28vw, 45vw"}
            position={cover(member, pair ? 1 : 4 / 5, 6)}
            className="transition-transform duration-700 ease-out-quint group-hover:scale-[1.04]"
          />
          <span
            className={`absolute left-2 top-2 max-w-[calc(100%-1rem)] truncate rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] backdrop-blur-md sm:left-3 sm:top-3 sm:px-2.5 sm:py-1 sm:text-[10px] sm:tracking-[0.14em] ${
              head ? "bg-forest text-paper" : "bg-paper/85 text-ink"
            }`}
          >
            {member.role}
          </span>
          <span className="absolute bottom-2 right-2 grid size-8 place-items-center sm:bottom-3 sm:right-3 sm:size-9 rounded-full bg-paper/90 text-ink shadow-sm backdrop-blur-md transition-all duration-500 group-hover:rotate-90 group-hover:bg-ink group-hover:text-paper">
            <Plus className="size-4" />
          </span>
        </span>
        <span className="mt-3.5 block px-1 font-serif text-[clamp(1.15rem,1.7vw,1.5rem)] leading-[1.12] [overflow-wrap:anywhere] transition-colors group-hover:text-forest">
          {member.name}
        </span>
        {meta && <span className="mt-1 block px-1 text-[13px] text-ink-3">{meta}</span>}
      </button>
    </motion.li>
  );
}
