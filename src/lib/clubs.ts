import type { Club, ClubCategory } from "./types";

/**
 * The 11 canonical clubs — BUILD_PLAN.md §3.3 (names, categories) and §4
 * (calendar colours; all muted to sit on paper, all AA against --card).
 *
 * Taglines are PLACEHOLDERS pending real copy from the council
 * (BUILD_PLAN §18, item 6). Keep this the single source; the DB seed imports it.
 */
export const CLUBS: readonly Club[] = [
  {
    slug: "coding",
    name: "Coding Club",
    shortName: "Coding",
    category: "Tech",
    color: "#3F5E4C",
    blurb: "Contribution nights, ladder contests, ICPC training.",
  },
  {
    slug: "innovation",
    name: "Innovation Club",
    shortName: "Innovation",
    category: "Tech",
    color: "#6B8E4E",
    blurb: "Build weekends, prototyping jams and demo days.",
  },
  {
    slug: "cybersentinel",
    name: "CyberSentinel Club",
    shortName: "CyberSentinel",
    category: "Tech",
    color: "#3B5675",
    blurb: "CTFs, wargames and responsible-disclosure practice.",
  },
  {
    slug: "animatrix",
    name: "Animatrix Club",
    shortName: "Animatrix",
    category: "Media",
    color: "#6B4A6B",
    blurb: "Motion, 3D and the annual showreel night.",
  },
  {
    slug: "magazine",
    name: "Magazine Club",
    shortName: "Magazine",
    category: "Media",
    color: "#8C5A2B",
    blurb: "The department magazine, from pitch to print.",
  },
  {
    slug: "fusion-fashion",
    name: "Fusion & Fashion Club",
    shortName: "Fusion & Fashion",
    category: "Cultural",
    color: "#A85751",
    blurb: "Styling, choreography and the annual runway.",
  },
  {
    slug: "nature",
    name: "Nature Club",
    shortName: "Nature",
    category: "Wellness",
    color: "#4F7A5B",
    blurb: "Trails, clean-ups and campus biodiversity walks.",
  },
  {
    slug: "yoga",
    name: "Yoga Club",
    shortName: "Yoga",
    category: "Wellness",
    color: "#7A8C5A",
    blurb: "Morning sessions on the lawn, all levels welcome.",
  },
  {
    slug: "aspirex",
    name: "AspireX Club",
    shortName: "AspireX",
    category: "Career",
    color: "#2F6B6B",
    blurb: "Placement prep, mock interviews and alumni talks.",
  },
  {
    slug: "appnova",
    name: "AppNova Club",
    shortName: "AppNova",
    category: "Tech",
    color: "#4A5E8C",
    blurb: "Mobile and web app building, shipped in public.",
  },
  {
    slug: "short-film",
    name: "Short Film & Movie Appreciation Club",
    shortName: "Short Film",
    category: "Media",
    color: "#6E5A3F",
    blurb: "Screenings, reviews and the 48-hour film race.",
  },
];

/** Filter order for the clubs directory (BUILD_PLAN §3.3). */
export const CLUB_CATEGORIES: readonly ClubCategory[] = [
  "Tech",
  "Media",
  "Cultural",
  "Wellness",
  "Career",
];
