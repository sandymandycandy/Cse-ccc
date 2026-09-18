import type { Metadata } from "next";
import { ArrowDown, ArrowUpRight } from "lucide-react";

import { ClubsExplorer } from "@/components/team/ClubsExplorer";
import { LayerNav } from "@/components/team/LayerNav";
import { CouncilGrid, PresidentFeature } from "@/components/team/LeadershipSections";
import { ContactSheet } from "@/components/team/ContactSheet";
import { CouncilOrbit } from "@/components/team/CouncilOrbit";
import { Reveal } from "@/components/team/Reveal";
import { SectionIntro } from "@/components/team/SectionIntro";
import { SmtCredits } from "@/components/team/SmtCredits";
import { TeamProvider } from "@/components/team/TeamProvider";
// `counts` stays a static import on purpose: the roster is fixed in code, so
// these numbers cannot change when details are edited. Routing them through
// context would add a re-render for a constant.
import { counts, members as fileMembers, pad } from "@/data/ccc";
import { siteHref } from "@/lib/site";
import { mergeProfiles, photoOverrides } from "@/lib/team/profiles";
import { getTeamProfileRows } from "@/lib/team/read";

const description =
  "Meet the students who run the CSE Club Council — the President, council leadership, the Heads and Vice Heads of every club, and the Social Media Team.";

export const metadata: Metadata = {
  title: "Team",
  description,
  openGraph: {
    title: "The people behind one community — CSE Club Council",
    description,
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "The people behind one community", description },
};

const delay = (ms: number) => ({ "--delay": `${ms}ms` }) as React.CSSProperties;
const container = "mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-14";

export default async function TeamPage() {
  // [] when the database is unreachable — mergeProfiles then returns the file's
  // values, so an outage costs the page its edits, not the page.
  const rows = await getTeamProfileRows();
  const members = mergeProfiles(fileMembers, rows);
  const photos = photoOverrides(rows);

  return (
    <TeamProvider members={members} photos={photos}>
        {/* ------------------------------------------------ Hero */}
        <section aria-labelledby="team-title" className={`${container} grid grid-cols-1 items-start gap-12 pb-20 pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:gap-16 lg:pb-28 lg:pt-24`}>
          <div className="min-w-0">
            <p className="rise font-mono text-[12px] uppercase tracking-[0.2em] text-ink-3" style={delay(60)}>
              Department of Computer Science · The team
            </p>
            <h1 id="team-title" className="mt-6 font-serif text-[clamp(3.2rem,7.4vw,6.2rem)] leading-[0.96] tracking-[-0.01em]">
              <span className="line-mask">
                <span style={delay(120)}>The people behind</span>
              </span>
              <span className="line-mask">
                <span style={delay(220)}>
                  one <em className="text-forest">community.</em>
                </span>
              </span>
            </h1>
            <p className="rise mt-7 max-w-xl text-[18px] leading-relaxed text-ink-2" style={delay(340)}>
              The council is run by {counts.people} students in four layers: a President, {counts.byLayer.council} council leads, the Heads and Vice
              Heads of all {counts.clubs} clubs, and an {counts.byLayer.smt}-member Social Media Team.
            </p>
            <div className="rise mt-9 flex flex-wrap gap-3" style={delay(420)}>
              <a
                href="#structure"
                className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-medium text-paper transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
              >
                How the council works <ArrowDown className="size-4" />
              </a>
              <a
                href="#clubs"
                className="inline-flex h-12 items-center rounded-full border border-line-3 bg-paper-2 px-6 text-[15px] font-medium transition-colors hover:bg-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
              >
                Find a club&rsquo;s leaders
              </a>
            </div>

            <dl className="rise mt-12 grid grid-cols-2 gap-x-8 gap-y-6 border-t border-line pt-7 sm:flex sm:flex-wrap sm:gap-x-10" style={delay(500)}>
              {[
                [counts.people, "People"],
                [pad(counts.layers), "Layers"],
                [counts.clubs, "Clubs"],
                [counts.byLayer.clubs, "Club leaders"],
                ...(counts.openRoles ? [[counts.openRoles, "Roles open"] as const] : []),
              ].map(([value, label]) => (
                <div key={label} className="flex flex-col-reverse">
                  <dt className="mt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">{label}</dt>
                  <dd className="font-serif text-[2.4rem] leading-none tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <ContactSheet />
        </section>

        {/* ------------------------------------------------ Structure */}
        <section id="structure" aria-labelledby="structure-title" className="scroll-mt-[var(--hdr)] border-t border-line bg-paper-2 py-20 lg:py-28">
          <div className={container}>
            <Reveal className="grid gap-6 lg:grid-cols-12 lg:gap-8">
              <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-ink-3 lg:col-span-4">How the council works</p>
              <div className="lg:col-span-8">
                <h2 id="structure-title" className="font-serif text-[clamp(2.6rem,5.4vw,4.75rem)] leading-[0.98]">
                  How the council <em className="text-forest">fits together.</em>
                </h2>
                <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-ink-2">
                  Picture it as an orbit. Leadership starts at the centre and widens ring by ring — scroll to move outward, one layer at a time.
                </p>
              </div>
            </Reveal>
            <CouncilOrbit />
          </div>
        </section>

        {/* ------------------------------------------------ Layers */}
        <div className="relative">
          <LayerNav />

          <section id="president" aria-labelledby="president-title" className={`${container} scroll-mt-[calc(var(--hdr)_+_81px)] py-20 lg:py-28`}>
            <SectionIntro layer="president" title={<>The <em className="text-forest">President</em></>} />
            <PresidentFeature />
          </section>

          <section id="council" aria-labelledby="council-title" className="scroll-mt-[calc(var(--hdr)_+_81px)] border-t border-line py-20 lg:py-28">
            <div className={container}>
              <SectionIntro layer="council" title={<>Council <em className="text-clay">leadership</em></>} />
              <CouncilGrid />
            </div>
          </section>

          <section id="clubs" aria-labelledby="clubs-title" className="scroll-mt-[calc(var(--hdr)_+_81px)] border-t border-line bg-paper-2 py-20 lg:py-28">
            <div className={container}>
              <SectionIntro layer="clubs" title={<>The {counts.clubs} <em>clubs</em></>} />
              <ClubsExplorer />
            </div>
          </section>

          <section id="smt" aria-labelledby="smt-title" className="scroll-mt-[calc(var(--hdr)_+_81px)] border-t border-line py-20 lg:py-28">
            <div className={container}>
              <SectionIntro layer="smt" title={<>Social Media <em className="text-rust">Team</em></>} />
              <SmtCredits />
            </div>
          </section>
        </div>

        {/* ------------------------------------------------ Closing */}
        <section aria-labelledby="closing-title" className="border-t border-line bg-sand">
          <div className={`${container} grid items-end gap-8 py-20 lg:grid-cols-12 lg:py-24`}>
            <Reveal className="lg:col-span-7">
              <h2 id="closing-title" className="font-serif text-[clamp(2.6rem,5.4vw,4.5rem)] leading-[0.98]">
                {counts.clubs} clubs. <em className="text-forest">Find yours.</em>
              </h2>
              <p className="mt-4 max-w-lg text-[17px] leading-relaxed text-ink-2">Every club has its own page on the council site, with its events and what it&rsquo;s about.</p>
            </Reveal>
            <Reveal className="flex flex-wrap gap-3 lg:col-span-5 lg:justify-end" delay={0.08}>
              <a
                href={siteHref("/clubs")}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-medium text-paper transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
              >
                Explore the clubs <ArrowUpRight className="size-4" />
              </a>
              <a
                href={siteHref("/contact")}
                className="inline-flex h-12 items-center rounded-full border border-line-3 bg-paper-2 px-6 text-[15px] font-medium transition-colors hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
              >
                Contact the council
              </a>
            </Reveal>
          </div>
        </section>
    </TeamProvider>
  );
}
