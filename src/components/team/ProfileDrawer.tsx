"use client";

import { useRef } from "react";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Mail, X } from "lucide-react";

import { getClub, getLayer, profileFields, type ClubId } from "@/data/ccc";
import { siteHref } from "@/lib/site";
import { selectClubLeaders, selectInLayer } from "@/lib/team/selectors";
import { Portrait } from "./Portrait";
import { Description } from "./shared/Description";
import { Portal } from "./shared/Portal";
import { useMediaQuery } from "./shared/useMediaQuery";
import { useModal } from "./shared/useModal";
import type { ViewStack } from "./shared/useViewStack";
import { useCoverPosition, useMembers } from "./team-context";
import { layerTone } from "./tones";

const ease = [0.22, 1, 0.36, 1] as const;

export function ProfileDrawer({ views, onShowClub }: { views: ViewStack; onShowClub: (id: ClubId, scroll?: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const drag = useDragControls();
  useModal(ref, views.close, closeRef);
  const desktop = useMediaQuery("(min-width: 768px)", true);
  // ⚠️ Every hook sits ABOVE the early return below. A hook after it would be
  // skipped on renders where no profile is open, and React would throw
  // "rendered fewer hooks than expected".
  const members = useMembers();
  const cover = useCoverPosition();

  const currentId = views.current?.id;
  const member = currentId ? members.find((m) => m.id === currentId) : undefined;
  if (!member) return null;

  const layer = getLayer(member.layer);
  const club = member.club ? getClub(member.club) : undefined;
  // Pure selectors, not hooks: this runs after the early return above.
  const ctx = member.club ? selectClubLeaders(members, member.club) : selectInLayer(members, member.layer);
  const index = ctx.findIndex((m) => m.id === member.id);
  const tone = layerTone[member.layer];
  const fields = profileFields(member).filter((f) => !["role", "club", "layer"].includes(f.key));

  const iconButton =
    "grid size-11 place-items-center rounded-full border border-line-3 bg-paper-2 text-ink transition-colors hover:bg-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest md:size-9";

  return (
    <Portal>
      <motion.div
        aria-hidden
        onClick={views.close}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-[100] bg-ink/35 backdrop-blur-[3px] night:bg-black/55"
      />
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
        tabIndex={-1}
        initial={desktop ? { x: "100%" } : { y: "100%" }}
        animate={desktop ? { x: 0 } : { y: 0 }}
        exit={desktop ? { x: "100%" } : { y: "100%" }}
        transition={{ duration: 0.55, ease }}
        // Bottom sheet: drag it down to dismiss, started from the grab handle so
        // the gesture never fights the content's own scrolling.
        drag={desktop ? false : "y"}
        dragControls={drag}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.7 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 120 || info.velocity.y > 700) views.close();
        }}
        className="fixed inset-x-0 bottom-0 z-[101] flex max-h-[92dvh] flex-col rounded-t-[28px] border-t border-line bg-paper text-ink shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.3)] outline-none md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[min(560px,100vw)] md:rounded-none md:border-l md:border-t-0"
      >
        {/* Grab handle — the full-width strip above the context bar is the drag target. */}
        <div
          aria-hidden
          onPointerDown={(e) => !desktop && drag.start(e)}
          className="absolute inset-x-0 top-0 z-10 h-7 cursor-grab touch-none active:cursor-grabbing md:hidden"
        >
          <span className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-line-4" />
        </div>

        {/* Context bar */}
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5 sm:px-7">
          <p className="flex min-w-0 items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
            <span className={`size-2 shrink-0 rounded-full ${tone.bg}`} />
            <span className="truncate">
              {layer.label} · {club ? club.short : layer.short}
            </span>
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            {ctx.length > 1 && (
              <>
                <button type="button" onClick={() => views.step(-1)} aria-label="Previous person" className={iconButton}>
                  <ChevronLeft className="size-4" />
                </button>
                <span className="px-1 font-mono text-[11px] tabular-nums text-ink-3" aria-live="polite">
                  {index + 1}/{ctx.length}
                </span>
                <button type="button" onClick={() => views.step(1)} aria-label="Next person" className={iconButton}>
                  <ChevronRight className="size-4" />
                </button>
              </>
            )}
            <button ref={closeRef} type="button" onClick={views.close} aria-label="Close profile" className={`${iconButton} ml-1.5`}>
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={member.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease }}
              className="px-5 pb-10 pt-6 sm:px-7"
            >
              <div className="grid grid-cols-[112px_1fr] items-end gap-5 sm:grid-cols-[150px_1fr]">
                <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-sand">
                  <Portrait member={member} sizes="150px" quality={90} position={cover(member, 4 / 5)} label />
                </div>
                <div className="min-w-0 pb-1">
                  <p className={`font-mono text-[11px] uppercase tracking-[0.14em] ${tone.text}`}>{member.role}</p>
                  <h2 id="profile-title" className="mt-2 font-serif text-[clamp(1.9rem,4vw,2.6rem)] leading-[1.02] [overflow-wrap:anywhere]">
                    {member.name}
                  </h2>
                  {club && <p className="mt-2 text-[15px] text-ink-2">{club.name}</p>}
                </div>
              </div>

              <Description member={member} className="mt-7 text-[16px] leading-relaxed text-ink-2" />

              <dl className="mt-7 divide-y divide-line border-y border-line">
                {fields.map((f) => (
                  <div key={f.key} className="grid grid-cols-[7.5rem_1fr] items-baseline gap-4 py-3">
                    <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">{f.label}</dt>
                    <dd className="min-w-0 break-words text-[15px]">
                      {f.href ? (
                        <a href={f.href} className="text-forest underline decoration-forest/30 underline-offset-4 hover:decoration-forest">
                          {f.value}
                        </a>
                      ) : (
                        f.value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="mt-7 flex flex-wrap gap-2.5">
                <a
                  href={`mailto:${member.email}`}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[14px] font-medium text-paper transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
                >
                  <Mail className="size-4" strokeWidth={1.75} /> Email
                </a>
                {member.portfolio && (
                  <a
                    href={member.portfolio}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-11 items-center gap-2 rounded-full border border-line-3 bg-paper-2 px-5 text-[14px] font-medium transition-colors hover:bg-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
                  >
                    Portfolio <ArrowUpRight className="size-4" strokeWidth={1.75} />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                )}
              </div>

              {club && (
                <div className="mt-9 rounded-2xl border border-line bg-sand p-5">
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">Part of</p>
                  <p className="mt-1.5 font-serif text-2xl">{club.name}</p>
                  <p className="mt-1 text-[14px] text-ink-2">{club.tagline}</p>
                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[14px] font-medium">
                    <button
                      type="button"
                      onClick={() => {
                        views.close();
                        onShowClub(club.id, true);
                      }}
                      className="inline-flex items-center gap-1.5 text-ink underline decoration-line-4 underline-offset-4 hover:decoration-ink"
                    >
                      See the club&rsquo;s leadership <ArrowRight className="size-3.5" />
                    </button>
                    {club.siteSlug && (
                      <a
                        href={siteHref(`/clubs/${club.siteSlug}`)}
                        className="inline-flex items-center gap-1.5 text-forest underline decoration-forest/30 underline-offset-4 hover:decoration-forest"
                      >
                        Club page <ArrowUpRight className="size-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </Portal>
  );
}
