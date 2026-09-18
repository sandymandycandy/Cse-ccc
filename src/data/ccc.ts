/**
 * CSE Clubs Council — organisation data.
 *
 * Sources (authority in this order):
 *  1. "CCC Team (Responses) - Form Responses 1" — names, VTU, email, description, portfolio.
 *  2. "CSE Clubs Council Details - Layer 3" — club roles, department, year.
 *  3. Names for Suja Suresh, Akshaya Gajendran and Shahana M confirmed by the council.
 *
 * Phone numbers are deliberately not stored or shown: people are contacted by email only.
 *  4. The council's own brief for Layer 1/2/SMT roles, years and departments.
 *
 * Rules: nothing is invented. A field that isn't in a source is left undefined and
 * the UI simply doesn't render it. Descriptions are verbatim; only whitespace and
 * spacing around punctuation were tidied, and author line breaks are kept (`\n`).
 * Positions that exist but aren't filled yet live in `openRoles` and render as
 * marked-open slots — never as a made-up person.
 *
 * Portraits: the image each person attached to their form response (Google Drive
 * "File responses" folder), matched by the Drive file id in that response — not by
 * filename. Every portrait lives at src/assets/team/<member id>.jpg. To add or swap
 * one, drop the file there and import it in `portraits` under the member's id.
 */
import type { StaticImageData } from "next/image";

import { coverPositionFrom } from "@/lib/team/framing";

import cheedellaVenkataSaiCharanPortrait from "@/assets/team/cheedella-venkata-sai-charan.jpg";
import thokalaSaiVarunPortrait from "@/assets/team/thokala-sai-varun.jpg";
import sSandeepKumarPortrait from "@/assets/team/s-sandeep-kumar.jpg";
import sureshPortrait from "@/assets/team/suresh.jpg";
import gaganSashankVotraPortrait from "@/assets/team/gagan-sashank-votra.jpg";
import gajendranPortrait from "@/assets/team/gajendran.jpg";
import m32775Portrait from "@/assets/team/m-32775.jpg";
import vNavaneethKumarPortrait from "@/assets/team/v-navaneeth-kumar.jpg";
import sureeshaPPortrait from "@/assets/team/sureesha-p.jpg";
import pratheshKumarVPortrait from "@/assets/team/prathesh-kumar-v.jpg";
import bhuvaneshwaranVPortrait from "@/assets/team/bhuvaneshwaran-v.jpg";
import abhinavRajeshPortrait from "@/assets/team/abhinav-rajesh.jpg";
import bGouthamPortrait from "@/assets/team/b-goutham.jpg";
import mSAdithyaPortrait from "@/assets/team/m-s-adithya.jpg";
import kishoreSPortrait from "@/assets/team/kishore-s.jpg";
import pardhuSingavarapuPortrait from "@/assets/team/pardhu-singavarapu.jpg";
import vRupaSriPortrait from "@/assets/team/v-rupa-sri.jpg";
import kolleparaYNJyothiLakshmiPraneethaPortrait from "@/assets/team/kollepara-y-n-jyothi-lakshmi-praneetha.jpg";
import gallaRevanthPortrait from "@/assets/team/galla-revanth.jpg";
import rakshanaAPortrait from "@/assets/team/rakshana-a.jpg";
import vankaArunJyothiPortrait from "@/assets/team/vanka-arun-jyothi.jpg";
import kanalaAkhilaPortrait from "@/assets/team/kanala-akhila.jpg";
import jayaprakashThudamaladinnePortrait from "@/assets/team/jayaprakash-thudamaladinne.jpg";
import logithAPortrait from "@/assets/team/logith-a.jpg";
import mannuruHasmithaPortrait from "@/assets/team/mannuru-hasmitha.jpg";
import lekkalaSashankPortrait from "@/assets/team/lekkala-sashank.jpg";
import dBhanuTejaPortrait from "@/assets/team/d-bhanu-teja.jpg";
import akshayChintaPortrait from "@/assets/team/akshay-chinta.jpg";
import rJayasuryaPortrait from "@/assets/team/r-jayasurya.jpg";
import venkataManidharReddyDPortrait from "@/assets/team/venkata-manidhar-reddy-d.jpg";
import gNikithaReddyPortrait from "@/assets/team/g-nikitha-reddy.jpg";
import uYuvanChandraUppaluruPortrait from "@/assets/team/u-yuvan-chandra-uppaluru.jpg";
import mYeshvandhKumarPortrait from "@/assets/team/m-yeshvandh-kumar.jpg";
import uSivaSatyaBhargavSriRamPortrait from "@/assets/team/u-siva-satya-bhargav-sri-ram.jpg";
import nBhanuPrasadPortrait from "@/assets/team/n-bhanu-prasad.jpg";
import kPremaHimajaPortrait from "@/assets/team/k-prema-himaja.jpg";
import pRohithPortrait from "@/assets/team/p-rohith.jpg";
import gLikithKrishnaPortrait from "@/assets/team/g-likith-krishna.jpg";
import tSreeLakshmiPortrait from "@/assets/team/t-sree-lakshmi.jpg";
import mHemashriPortrait from "@/assets/team/m-hemashri.jpg";
import lakKshwanthySPortrait from "@/assets/team/lak-kshwanthy-s.jpg";
import chintapalliGVSSPNSujithPortrait from "@/assets/team/chintapalli-g-v-s-s-p-n-sujith.jpg";
import dasaManisaiPortrait from "@/assets/team/dasa-manisai.jpg";
import gNaniPrabhasPortrait from "@/assets/team/g-nani-prabhas.jpg";
import kunteShashidharRaoPortrait from "@/assets/team/kunte-shashidhar-rao.jpg";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */

export type LayerId = "president" | "council" | "clubs" | "smt";

export type ClubId =
  | "coding"
  | "innovation"
  | "cybersentinel"
  | "animatrix"
  | "magazine"
  | "fashion-fusion"
  | "nature"
  | "yoga"
  | "aspirex"
  | "appnova"
  | "short-film"
  | "ai-forge"
  | "netforge";

export type SmtGroup = "Coordination" | "Camera" | "Post-production" | "Analytics" | "Writing" | "On-screen";

export type Member = {
  id: string;
  name: string;
  role: string;
  layer: LayerId;
  club?: ClubId;
  smtGroup?: SmtGroup;
  year?: string;
  department?: string;
  vtu: string;
  email: string;
  description?: string;
  portfolio?: string;
};

export type Club = {
  id: ClubId;
  number: number;
  name: string;
  short: string;
  /** Tagline, verbatim from the club's card on cse-ccc.vercel.app/clubs. */
  tagline: string;
  /** Slug of the club's page on the main site: /clubs/<siteSlug>. Undefined until the club has one. */
  siteSlug?: string;
  /** The club's own description, where it supplied one. Verbatim. */
  about?: string;
  /** A club that has just been announced and isn't on the main site yet. */
  isNew?: boolean;
  /** Only where a leader stated it in their submission. */
  memberCount?: number;
};

/**
 * A position that exists on the org chart but hasn't been filled yet. These are
 * placeholders on purpose — no name, no invented person. To fill one, delete the
 * entry here and add the real person to `members`.
 */
export type OpenRole = {
  id: string;
  role: string;
  club: ClubId;
  /** Extra context shown on the card, e.g. what the role covers. */
  note?: string;
};

export type Layer = {
  id: LayerId;
  number: number;
  label: string;
  title: string;
  short: string;
  summary: string;
};

/* -------------------------------------------------------------------------- */
/* Structure                                                                  */

export const layers: Layer[] = [
  {
    id: "president",
    number: 1,
    label: "Layer 01",
    title: "President",
    short: "President",
    summary: "Leads the council and oversees every club, working with the HoD and department leadership.",
  },
  {
    id: "council",
    number: 2,
    label: "Layer 02",
    title: "Council Leadership",
    short: "Council",
    summary:
      "Six council-level roles — Vice President, Technical, Events, Social Media and Documentation — that support and coordinate every club.",
  },
  {
    id: "clubs",
    number: 3,
    label: "Layer 03",
    title: "Club Leadership",
    short: "Clubs",
    summary: "Every club is run by its own Heads and Vice Heads. Pick a club to see who leads it — including the roles still being recruited for.",
  },
  {
    id: "smt",
    number: 4,
    label: "Layer 04",
    title: "Social Media Team",
    short: "SMT",
    summary: "Coordinators, camera crew, editors, writers and on-screen talent who cover and promote everything the council does.",
  },
];

export const clubs: Club[] = [
  { id: "coding", number: 1, name: "Coding Club", short: "Coding", siteSlug: "coding", tagline: "Contribution nights, ladder contests, ICPC training." },
  { id: "innovation", number: 2, name: "Innovation Club", short: "Innovation", siteSlug: "innovation", tagline: "Build weekends, prototyping jams and demo days." },
  { id: "cybersentinel", number: 3, name: "CyberSentinel Club", short: "CyberSentinel", siteSlug: "cybersentinel", tagline: "CTFs, wargames and responsible-disclosure practice." },
  { id: "animatrix", number: 4, name: "Animatrix Club", short: "Animatrix", siteSlug: "animatrix", tagline: "Motion, 3D and the annual showreel night." },
  { id: "magazine", number: 5, name: "Magazine Club", short: "Magazine", siteSlug: "magazine", tagline: "The department magazine, from pitch to print." },
  { id: "fashion-fusion", number: 6, name: "Fashion & Fusion Club", short: "Fashion & Fusion", siteSlug: "fusion-fashion", tagline: "Styling, choreography and the annual runway." },
  { id: "nature", number: 7, name: "Nature Club", short: "Nature", siteSlug: "nature", tagline: "Trails, clean-ups and campus biodiversity walks." },
  { id: "yoga", number: 8, name: "Yoga Club", short: "Yoga", siteSlug: "yoga", tagline: "Morning sessions on the lawn, all levels welcome." },
  { id: "aspirex", number: 9, name: "AspireX Club", short: "AspireX", siteSlug: "aspirex", tagline: "Placement prep, mock interviews and alumni talks.", memberCount: 27 },
  { id: "appnova", number: 10, name: "AppNova Club", short: "AppNova", siteSlug: "appnova", tagline: "Ideas into Apps, Built and Shipped in Public." },
  { id: "short-film", number: 11, name: "Short Film & Movie Appreciation Club", short: "Short Film", siteSlug: "short-film", tagline: "Create. Capture. Inspire." },
  { id: "ai-forge", number: 12, name: "AI Forge", short: "AI Forge", siteSlug: "ai-forge", tagline: "Ai For All" },
  {
    id: "netforge",
    number: 13,
    name: "NetForge",
    short: "NetForge",
    isNew: true,
    tagline: "Learn the Networks. Build the Infrastructure. Forge the Future.",
    about:
      "NetForge is a hands-on technical community focused on exploring the world of computer networking, network infrastructure, and connected technologies. The club provides students with opportunities to understand how modern networks are designed, configured, secured, and managed through practical lab sessions, workshops, technical sessions, projects, and real-world challenges. From network fundamentals, routing and switching, protocols, and network devices to cybersecurity, cloud networking, IoT, and network automation, NetForge encourages students to move beyond theory and build practical skills through experimentation and collaboration.",
  },
];

/**
 * Positions currently being recruited for. They render as marked-open slots
 * alongside the club's leaders; nobody is invented to fill them.
 */
export const openRoles: OpenRole[] = [
  { id: "netforge-head", role: "Head", club: "netforge" },
  { id: "netforge-vice-head", role: "Vice Head", club: "netforge" },
];

export const council = {
  name: "CSE Clubs Council",
  short: "CCC",
  tagline: `${clubs.length} clubs. One community.`,
  pillars: ["Student Leadership", "Technology", "Creativity", "Collaboration"],
} as const;

/* -------------------------------------------------------------------------- */
/* People                                                                     */

export const members: Member[] = [
  /* ---------------- Layer 1 ---------------- */
  {
    id: "cheedella-venkata-sai-charan",
    name: "Cheedella Venkata Sai Charan",
    role: "President",
    layer: "president",
    year: "IV",
    department: "CSE (AIML)",
    vtu: "24996",
    email: "vtu24996@veltech.edu.in",
    description:
      "Final-year student and President of the CCC.\nOverseeing all 12 clubs under the council.\nWorking with the HoD and leadership to drive initiatives and student engagement.\nEmpowering teams, creating opportunities, and making things happen.",
    portfolio: "https://www.charancheedella.xyz/",
  },

  /* ---------------- Layer 2 ---------------- */
  {
    id: "thokala-sai-varun",
    name: "Thokala Sai Varun",
    role: "Vice President",
    layer: "council",
    year: "III",
    department: "CSE (AIDS)",
    vtu: "30363",
    email: "vtu30363@veltech.edu.in",
    description:
      "As Vice President of the CSE Clubs Council, I oversee 12 clubs by coordinating their Heads and Vice Heads, aligning teams with council goals, resolving challenges, driving inter-club collaboration, and ensuring initiatives are planned and executed effectively.",
    portfolio: "https://sai-varun-portfolio-phi.vercel.app/",
  },
  {
    id: "s-sandeep-kumar",
    name: "S Sandeep Kumar",
    role: "Technical Head",
    layer: "council",
    year: "III",
    department: "CSE (AIML)",
    vtu: "27884",
    email: "vtu27884@veltech.edu.in",
    description:
      "Third-year student and Technical Head of the CCC, supporting the technical activities of all 12 clubs. Collaborating with teams and faculty to drive events, projects, innovation, and student engagement while turning ideas into impactful technical initiatives.",
  },
  {
    id: "suresh",
    // Form name "Suresh"; full name confirmed by the council as Suja Suresh.
    name: "Suja Suresh",
    role: "Events Head",
    layer: "council",
    year: "II",
    department: "CSE (AIML)",
    vtu: "32424",
    email: "suresh2025@gmail.com",
    description:
      "Second year student and Event Head of the CSC Council.\nCoordinating and supporting all 12 clubs under the council.\nBuilding strong teams, bringing new ideas, and turning plans into successful events.\nLeading with teamwork, creativity, and making things happen.",
  },
  {
    id: "gagan-sashank-votra",
    name: "Gagan Sashank Votra",
    role: "Social Media Head",
    layer: "council",
    year: "III",
    department: "CSE (AIML)",
    vtu: "30261",
    email: "vtu30261@veltech.edu.in",
    description:
      "Third-year student and Social Media Head of the CCC. Managing social media, promotional campaigns, and digital content. Collaborating with all club heads to promote events, create engaging reels, and strengthen CCC’s online presence and student engagement.",
  },
  {
    id: "gajendran",
    // Form name "Gajendran"; full name confirmed by the council as Akshaya Gajendran.
    name: "Akshaya Gajendran",
    role: "Documentation Head",
    layer: "council",
    year: "II",
    department: "CSE",
    vtu: "32144",
    email: "vtu32144@veltech.edu.in",
    description:
      "Second year student and Documentation Head of CCC. Managing documentation and records across the council. Collaborating with leadership to support initiatives and keep everything organized. Empowering teams, streamlining processes, and making things happen.",
  },
  {
    id: "m-32775",
    // Form name "M"; full name confirmed by the council as Shahana M.
    name: "Shahana M",
    role: "Documentation Co-Head",
    layer: "council",
    year: "II",
    department: "CSE",
    vtu: "32775",
    email: "vtu32775@veltech.edu.in",
    description:
      "Second-year CSE student & Documentation Co-Head of the CSE Clubs Council. Leading documentation, reports, and event records across the council while collaborating with club teams and leadership to streamline communication, strengthen coordination, and support impactful student initiatives.",
  },

  /* ---------------- Layer 3 · Coding ---------------- */
  {
    id: "v-navaneeth-kumar",
    name: "V Navaneeth Kumar",
    role: "Head",
    layer: "clubs",
    club: "coding",
    year: "III",
    department: "CSE",
    vtu: "28034",
    email: "vtu28034@veltech.edu.in",
    description:
      "Head of the Coding Club under the CSE Clubs Council. Leading coding sessions, coordinating club activities, and creating opportunities for students to learn, practice, and grow their programming and problem-solving skills.",
  },
  {
    id: "sureesha-p",
    name: "Sureesha P",
    role: "Vice Head",
    layer: "clubs",
    club: "coding",
    // Council brief gives III; the Layer 3 details sheet lists II.
    year: "III",
    department: "CSE",
    vtu: "30767",
    email: "vtu30767@veltech.edu.in",
    description:
      "Computer Science student passionate about AI, software development & emerging technologies. Vice Head of the Coding Club and IEEE member, experienced in hackathons and innovative projects. Passionate about leadership, problem-solving, learning, and building impactful solutions.",
  },

  /* ---------------- Innovation ---------------- */
  {
    id: "prathesh-kumar-v",
    name: "Prathesh Kumar V",
    role: "Head",
    layer: "clubs",
    club: "innovation",
    year: "III",
    department: "CSE (AI & ML)",
    vtu: "27431",
    email: "vtu27431@veltech.edu.in",
    description:
      "Third-year B.Tech CSE (AI & ML) student and Head of the Innovation Club. Passionate about innovation, technology, and entrepreneurship. Leading students, organizing ideation and pitching initiatives, and creating opportunities to transform ideas into impactful real-world solutions.",
  },
  {
    id: "bhuvaneshwaran-v",
    name: "Bhuvaneshwaran V",
    role: "Vice Head",
    layer: "clubs",
    club: "innovation",
    year: "III",
    department: "CSE",
    vtu: "27980",
    email: "vtu27980@veltech.edu.in",
    description:
      "B.Tech CSE 3RD student, Innovation Club Vice Head, and Founder of Open X Mind. Passionate about AI, startups and innovation. Leading teams, organizing hackathons and idea-pitching initiatives, and helping students turn ideas into prototypes and real-world solutions.",
  },

  /* ---------------- CyberSentinel ---------------- */
  {
    id: "abhinav-rajesh",
    name: "Abhinav Rajesh",
    role: "Head",
    layer: "clubs",
    club: "cybersentinel",
    year: "I",
    department: "CSE (Cybersecurity)",
    vtu: "35348",
    email: "vtu35348@veltech.edu.in",
    description:
      "Frist year student and Head of Cybersentinal Club. Works with multiple LLCs/orgs, gaining hands-on experience. Specializes in rev engineering, OSINT, pentesting, backend dev, etc. Leads initiatives and empowers students through practical security work.",
    portfolio: "https://guns.lol/goofisdead",
  },
  {
    id: "b-goutham",
    name: "B.GOUTHAM",
    role: "Vice Head",
    layer: "clubs",
    club: "cybersentinel",
    year: "III",
    department: "CSE",
    vtu: "28491",
    email: "vtu28491@veltech.edu.in",
    description:
      "Third-year CSE student & Vice Head, Cyber Sentinel Club. Aspiring SOC Analyst actively learning & prepping for defensive security roles. I empower peers through hands-on labs, threat monitoring, and blue team essentials while building my own SOC skill set.",
  },

  /* ---------------- Animatrix ---------------- */
  {
    id: "m-s-adithya",
    name: "M S Adithya",
    role: "Head (Game Dev)",
    layer: "clubs",
    club: "animatrix",
    year: "III",
    department: "CSE",
    vtu: "28751",
    email: "vtu28751@veltech.edu.in",
    description:
      "B.Tech CSE 3rd year student and Head of the Game Development Club (Animatrix). Building a creative community, mentoring students, and driving game development initiatives within the game development student community.",
  },
  {
    id: "kishore-s",
    name: "Kishore S",
    role: "Head (E-Sports)",
    layer: "clubs",
    club: "animatrix",
    year: "III",
    department: "CSE",
    vtu: "27445",
    email: "vtu27445@veltech.edu.in",
    description:
      "3rd-year student and Head of ESports.\nLeading esports activities, tournaments, and gaming initiatives.\nWorking with teams and leadership to drive engagement and build a strong gaming community.\nEmpowering gamers, creating opportunities, and making every game count.",
  },
  {
    id: "pardhu-singavarapu",
    name: "Pardhu Singavarapu",
    role: "Head (Animatrix)",
    layer: "clubs",
    club: "animatrix",
    year: "II",
    department: "CSE",
    vtu: "33524",
    email: "vtu33524@veltech.edu.in",
    description:
      "Second year student and Animation Department Head at Animatrix under the CSE Club Council. Leading the animation team, guiding members in creative skills, and driving engaging visual projects and initiatives that bring ideas to life.",
  },
  {
    id: "chintapalli-g-v-s-s-p-n-sujith",
    name: "CHINTAPALLI G V S S P N SUJITH",
    role: "Vice Head",
    layer: "clubs",
    club: "animatrix",
    year: "II",
    department: "CSE",
    vtu: "33563",
    email: "vtu33563@veltech.edu.in",
    description:
      "Passionate and creative student serving as the Vice-Head of the Club, supporting the team in planning and executing initiatives. I contribute to animation, designing, and creative projects while encouraging teamwork, innovation, and active student participation.",
  },
  {
    id: "s-anurudh",
    name: "S.Anurudh",
    role: "Vice Head (Game Dev)",
    layer: "clubs",
    club: "animatrix",
    year: "III",
    department: "CSE (AIDS)",
    vtu: "27735",
    email: "vtu27735@veltech.edu.in",
  },

  /* ---------------- Magazine ---------------- */
  {
    id: "v-rupa-sri",
    name: "V. Rupa Sri",
    role: "Head",
    layer: "clubs",
    club: "magazine",
    year: "III",
    department: "CSE",
    vtu: "29462",
    email: "vtu29462@veltech.edu.in",
    description:
      "Third-year student and Head of the Magazine Club. Passionate about writing, design, research, and creative collaboration. Leading the team to create meaningful content, encourage student voices, and build a platform for ideas, creativity, and expression.",
  },
  {
    // Replaces the earlier Vice Head (Aliyah Zaineb), per the council.
    id: "g-nani-prabhas",
    name: "G.Nani Prabhas",
    role: "Vice Head",
    layer: "clubs",
    club: "magazine",
    year: "III",
    department: "CSE",
    vtu: "29169",
    email: "vtu29169@veltech.edu.in",
    description:
      "Iam a Third-year Computer Science student joined the Magazine Club for collaborating with the People and leadership team to drive initiatives, engage students, empower teams, and learn skills and express my talent.",
  },

  /* ---------------- Fashion & Fusion ---------------- */
  {
    id: "kollepara-y-n-jyothi-lakshmi-praneetha",
    name: "Kollepara Y N Jyothi Lakshmi Praneetha",
    role: "Head",
    layer: "clubs",
    club: "fashion-fusion",
    year: "III",
    department: "CSE (AIDS)",
    vtu: "27682",
    email: "vtu27682@veltech.edu.in",
    description:
      "Head of Fusion & Fashion at the CCC.\nLeading initiatives that blend fashion, creativity, culture, and design. Creating platforms for students to showcase their talent, express themselves, and explore new ideas. Turning creativity into experiences that inspire and make an impact.",
    portfolio: "https://praneetha-kollepara.vercel.app/",
  },
  {
    id: "galla-revanth",
    name: "GALLA REVANTH",
    role: "Vice Head",
    layer: "clubs",
    club: "fashion-fusion",
    year: "II",
    department: "CSE (AIML)",
    vtu: "32755",
    email: "vtu32755@veltech.edu.in",
    description:
      "Second-year student and vice head of Fashion and fusion club\nI got really fascinated by the art fashion, the cultures it builds and the value it holds among humans. I joined the club to learn more and grow\nI have a very creative mind and I will give my all to the club and make it grow with me",
  },

  /* ---------------- Nature ---------------- */
  {
    id: "rakshana-a",
    name: "Rakshana A",
    role: "Head",
    layer: "clubs",
    club: "nature",
    year: "II",
    department: "CSE",
    vtu: "30743",
    email: "vtu30743@veltech.edu.in",
    // Two submissions exist; this is the later one (9/15/2026 16:21).
    description:
      "2nd-Year Student and Nature Club Head – CCC\nLeading the Nature Club under CCC, coordinating members and environmental initiatives. Working with faculty and student leadership to organize plantation drives, awareness campaigns, and sustainability, teamwork, participation, and positive change.",
  },
  {
    id: "kunte-shashidhar-rao",
    name: "Kunte Shashidhar Rao",
    role: "Vice Head",
    layer: "clubs",
    club: "nature",
    year: "III",
    department: "CSE (AIDS)",
    vtu: "28428",
    email: "vtu28428@veltech.edu.in",
    description:
      "I am a third-year B.Tech student and Vice Head of the Nature Club.\nPassionate about environmental conservation, sustainability, and creating awareness among students.\nActively involved in organizing initiatives that promote a greener and healthier environment.",
  },

  /* ---------------- Yoga ---------------- */
  {
    id: "vanka-arun-jyothi",
    name: "Vanka Arun Jyothi",
    role: "Head",
    layer: "clubs",
    club: "yoga",
    year: "II",
    department: "CSE (CS)",
    vtu: "31959",
    email: "vtu31959@veltech.edu.in",
    description:
      "2nd year student and head of yoga club. Working with vice head and club coordinator and giving a best training based on yogas and asanas.",
  },
  {
    id: "kanala-akhila",
    name: "Kanala Akhila",
    role: "Vice Head",
    layer: "clubs",
    club: "yoga",
    year: "II",
    department: "CSE (AIML)",
    vtu: "32188",
    email: "vtu32188@veltech.edu.in",
    description:
      "B.Tech AI & ML student at Veltech University and Vice Head of the Yoga Club. Leading student engagement and supporting events, activities, and wellness initiatives. Passionate about teamwork, leadership, communication, and creating meaningful opportunities for students.",
  },

  /* ---------------- AspireX ---------------- */
  {
    id: "jayaprakash-thudamaladinne",
    name: "JAYAPRAKASH THUDAMALADINNE",
    role: "Head",
    layer: "clubs",
    club: "aspirex",
    year: "III",
    department: "CSE",
    vtu: "28024",
    email: "vtu28024@veltech.edu.in",
    description:
      "Third-year Student and Head of AspireX Club under CCC.\nOverseeing all 27 members of the AspireX Club.\nWorking with the President of CCC, I lead and coordinate student-driven initiatives focused on innovation, problem-solving, skill development, and career growth.",
  },
  {
    id: "logith-a",
    name: "LOGITH A",
    role: "Vice Head",
    layer: "clubs",
    club: "aspirex",
    year: "I",
    department: "CSE",
    vtu: "34393",
    email: "vtu34393@veltech.edu.in",
    description:
      "Engineering student and Vice Head of AspireX Club, co-leading operations, technical events, and peer-learning initiatives. Working with leadership to drive engagement, empowering teams, creating opportunities, and turning ideas into impactful execution.",
  },

  /* ---------------- AppNova ---------------- */
  {
    id: "mannuru-hasmitha",
    name: "Mannuru Hasmitha",
    role: "Head",
    layer: "clubs",
    club: "appnova",
    year: "III",
    department: "CSE (AIML)",
    vtu: "29897",
    email: "vtu29897@veltech.edu.in",
    description:
      "Prefinal-year CSE (AIML) student and Head of AppNova Club.\nLeading the club in organizing technical activities and interactive learning sessions.\nWorking with the team to encourage innovation, collaboration, and student participation.\nCreating opportunities to learn, build, and explore technology.",
  },
  {
    id: "lekkala-sashank",
    name: "Lekkala.Sashank",
    role: "Vice Head",
    layer: "clubs",
    club: "appnova",
    year: "II",
    department: "CSE (AIML)",
    vtu: "31590",
    email: "vtu31590@veltech.edu.in",
    description:
      "Vice Head of AppNova Club, leading technical initiatives and coordinating student teams. Driving structured learning programs, workshops, projects, and industry-focused activities while creating opportunities for members to develop technical, teamwork, and leadership skills.",
  },

  /* ---------------- Short Film ---------------- */
  {
    id: "d-bhanu-teja",
    name: "D.BHANU TEJA",
    role: "Head",
    layer: "clubs",
    club: "short-film",
    year: "III",
    department: "CSE",
    vtu: "27978",
    email: "vtu27978@veltech.edu.in",
    description:
      "Third-year student and Film Club Head, leading the club in organizing film-related events, competitions, and creative activities. Encouraging students to explore filmmaking, storytelling, editing, and visual creativity while building teamwork and leadership.",
  },
  {
    id: "akshay-chinta",
    name: "Akshay chinta",
    role: "Vice Head",
    layer: "clubs",
    club: "short-film",
    year: "III",
    department: "CSE (AIML)",
    vtu: "29801",
    email: "vtu29801@veltech.edu.in",
    description:
      "3rd-year student and Vice Head of the Short Film Club. Passionate about filmmaking, storytelling, and creative collaboration. Working with the team to develop unique ideas, create impactful short films, and provide students with opportunities to learn, create, and grow.",
  },

  /* ---------------- AI Forge ---------------- */
  {
    id: "r-jayasurya",
    name: "R.JAYASURYA",
    role: "Head",
    layer: "clubs",
    club: "ai-forge",
    year: "III",
    department: "CSE (AIML)",
    vtu: "27657",
    email: "vtu27657@veltech.edu.in",
    description:
      "Head of AI Forge, a student-led club focused on AI tools and emerging technologies. Leading sessions and hands-on workshops to help students learn, explore, and effectively use AI tools for academics, projects, creativity, and real-world applications.",
    portfolio: "https://jayasurya-ai-command.lovable.app",
  },
  {
    id: "dasa-manisai",
    name: "DASA MANISAI",
    role: "Vice Head",
    layer: "clubs",
    club: "ai-forge",
    year: "III",
    department: "CSE (AIML)",
    vtu: "28846",
    email: "vtu28846@veltech.edu.in",
    description:
      "B.Tech 3rd year student and Vice Head of AI FORGE CLUB under the CSE Clubs Council, driving technical learning and student engagement in learning about Artificial intelligence and Machine Learning. Organizing interactive sessions and activities, coordinating the club team.",
  },
  {
    id: "venkata-manidhar-reddy-d",
    name: "VENKATA MANIDHAR REDDY D",
    role: "Vice Head",
    layer: "clubs",
    club: "ai-forge",
    year: "III",
    department: "CSE (AIML)",
    vtu: "28274",
    email: "vtu28274@veltech.edu.in",
    description: "Ai forge vise head",
  },

  /* ---------------- Layer 4 · SMT ---------------- */
  {
    id: "g-nikitha-reddy",
    name: "G. Nikitha Reddy",
    role: "Social Media Coordinator",
    layer: "smt",
    smtGroup: "Coordination",
    vtu: "30229",
    email: "vtu30229@veltech.edu.in",
    description:
      "Social Media Coordinator, I’ll manage event information, coordinate with teammates, help create reels and other content, participate in acting for promotions, and support the team on event days through effective communication and coordination",
  },
  {
    id: "u-yuvan-chandra-uppaluru",
    name: "U. Yuvan chandra Uppaluru",
    role: "Photographer & Videographer",
    layer: "smt",
    smtGroup: "Camera",
    vtu: "29907",
    email: "vtu29907@veltech.edu.in",
    description:
      "As the Videography Lead & Photographer of the CCC Social Media Team, I capture and create engaging visuals for our events, activities, and achievements. I coordinate event coverage and ensure every important moment is documented creatively and professionally..",
  },
  {
    id: "m-yeshvandh-kumar",
    name: "M. Yeshvandh Kumar",
    role: "Lead Editor",
    layer: "smt",
    smtGroup: "Post-production",
    year: "II",
    vtu: "31411",
    email: "vtu31411@veltech.edu.in",
    description:
      "Second-year student and Lead Video Editor of the CCC. Leading video production and creative storytelling for council initiatives and events. Capturing moments, showcasing student achievements, and turning ideas into impactful visual content that strengthens the CCC’s digital presence.",
    portfolio: "https://yesh17edits.github.io/",
  },
  {
    id: "u-siva-satya-bhargav-sri-ram",
    name: "U. Siva Satya Bhargav Sri Ram",
    role: "Social Media Analyst & Supporting Editor",
    layer: "smt",
    smtGroup: "Analytics",
    vtu: "29652",
    email: "vtu29652@veltech.edu.in",
    description:
      "I’m a Social Media Marketing & Analytics professional with a strong interest in digital branding, content strategy, audience engagement, and data-driven growth. I focus on creating impactful social media content, analyzing performance insights, and developing strategies.",
    portfolio: "https://bhargavsriram0721-oss.github.io/PORTFOLIO/",
  },
  {
    id: "n-bhanu-prasad",
    name: "N. Bhanu prasad",
    role: "Videographer",
    layer: "smt",
    smtGroup: "Camera",
    vtu: "29339",
    email: "vtu29339@veltech.edu.in",
    description:
      "Social Media Team member of the CSE Clubs Council, working on content creation, social media, videography, and editing to strengthen CCC’s digital presence and showcase the activities of all clubs.",
  },
  {
    id: "k-prema-himaja",
    name: "K. Prema Himaja",
    role: "Script Writer",
    layer: "smt",
    smtGroup: "Writing",
    vtu: "28310",
    email: "vtu28310@veltech.edu.in",
    description:
      "I’m Himaja, a CSE Club Council Social Media Team member working in Script Writing. I create scripts for promotional, event, registration and introduction reels. I also contribute to direction and execution, while developing my creativity, teamwork, communication and content creation skills.",
  },
  {
    id: "p-rohith",
    name: "P. Rohith",
    role: "Script Writer",
    layer: "smt",
    smtGroup: "Writing",
    vtu: "30062",
    email: "vtu30062@veltech.edu.in",
    description:
      "As a Script Writer in the club, I create creative scripts and storylines for reels, event promotions, and social media content. I collaborate with the team during shoots, develop engaging concepts, write dialogues, and ensure the content is clear, professional, and suitable for our official page.",
  },
  {
    id: "g-likith-krishna",
    name: "G. Likith krishna",
    role: "Script Writer",
    layer: "smt",
    smtGroup: "Writing",
    year: "I",
    department: "CSE",
    vtu: "36952",
    email: "vtu36952@veltech.edu.in",
    description:
      "First-Year CSE Student | Social Media Team (SMT)\nAs a member of the Social Media Team (SMT), I contribute to creating engaging content\nAlways looking to learn, collaborate, and turn creative ideas into something people actually notice !!",
  },
  {
    id: "t-sree-lakshmi",
    name: "T. Sree Lakshmi",
    role: "Acting and Content Creation",
    layer: "smt",
    smtGroup: "On-screen",
    year: "II",
    vtu: "33235",
    email: "vtu33235@veltech.edu.in",
    description:
      "Myself sree, second year student working as actor in social media club member of CSE club council. Our team will work under promoting all club in CCC. And covering all activities under CCC.",
  },
  {
    id: "m-hemashri",
    name: "M. Hemashri",
    role: "Script Writer",
    layer: "smt",
    smtGroup: "Writing",
    year: "I",
    vtu: "37129",
    email: "vtu37129@veltech.edu.in",
    description:
      "First year student from Social Media Team member of the CSE Clubs Council, working as a Script Writer and Videographer with an interest in on-camera content, helping capture and present every club's activities in a creative and engaging way.",
  },
  {
    id: "lak-kshwanthy-s",
    name: "Lak kshwanthy. S",
    role: "Editor",
    layer: "smt",
    smtGroup: "Post-production",
    year: "I",
    vtu: "35040",
    email: "vtu35040@veltech.edu.in",
    description:
      "First-year student and Editor of the CCC. Supporting video production and creative content for council events and initiatives. Learning, creating, and contributing fresh ideas while helping capture and showcase student activities through engaging visual stories.",
  },
];

/* -------------------------------------------------------------------------- */
/* Portraits                                                                  */

export type Portrait = { src: StaticImageData; focal: { x: number; y: number } };

/** Local portraits by member id. Focal points are face centres from on-device face detection.
 *  Members without one render a designed placeholder. */
export const portraits: Partial<Record<string, Portrait>> = {
  "cheedella-venkata-sai-charan": { src: cheedellaVenkataSaiCharanPortrait, focal: { x: 49, y: 33 } },
  "thokala-sai-varun": { src: thokalaSaiVarunPortrait, focal: { x: 49, y: 41 } },
  "s-sandeep-kumar": { src: sSandeepKumarPortrait, focal: { x: 40, y: 48 } },
  "suresh": { src: sureshPortrait, focal: { x: 57, y: 31 } },
  "gagan-sashank-votra": { src: gaganSashankVotraPortrait, focal: { x: 50, y: 44 } },
  "gajendran": { src: gajendranPortrait, focal: { x: 47, y: 38 } },
  "m-32775": { src: m32775Portrait, focal: { x: 49, y: 39 } },
  "v-navaneeth-kumar": { src: vNavaneethKumarPortrait, focal: { x: 49, y: 37 } },
  "sureesha-p": { src: sureeshaPPortrait, focal: { x: 53, y: 36 } },
  "prathesh-kumar-v": { src: pratheshKumarVPortrait, focal: { x: 50, y: 40 } },
  "bhuvaneshwaran-v": { src: bhuvaneshwaranVPortrait, focal: { x: 50, y: 43 } },
  "abhinav-rajesh": { src: abhinavRajeshPortrait, focal: { x: 50, y: 39 } },
  "b-goutham": { src: bGouthamPortrait, focal: { x: 51, y: 44 } },
  "m-s-adithya": { src: mSAdithyaPortrait, focal: { x: 49, y: 40 } },
  "kishore-s": { src: kishoreSPortrait, focal: { x: 52, y: 41 } },
  "pardhu-singavarapu": { src: pardhuSingavarapuPortrait, focal: { x: 47, y: 38 } },
  "v-rupa-sri": { src: vRupaSriPortrait, focal: { x: 48, y: 36 } },
  "kollepara-y-n-jyothi-lakshmi-praneetha": { src: kolleparaYNJyothiLakshmiPraneethaPortrait, focal: { x: 48, y: 43 } },
  "galla-revanth": { src: gallaRevanthPortrait, focal: { x: 51, y: 37 } },
  "rakshana-a": { src: rakshanaAPortrait, focal: { x: 51, y: 38 } },
  "vanka-arun-jyothi": { src: vankaArunJyothiPortrait, focal: { x: 50, y: 41 } },
  "kanala-akhila": { src: kanalaAkhilaPortrait, focal: { x: 52, y: 37 } },
  "jayaprakash-thudamaladinne": { src: jayaprakashThudamaladinnePortrait, focal: { x: 49, y: 35 } },
  "logith-a": { src: logithAPortrait, focal: { x: 50, y: 39 } },
  "mannuru-hasmitha": { src: mannuruHasmithaPortrait, focal: { x: 53, y: 35 } },
  "lekkala-sashank": { src: lekkalaSashankPortrait, focal: { x: 53, y: 34 } },
  "d-bhanu-teja": { src: dBhanuTejaPortrait, focal: { x: 49, y: 38 } },
  "akshay-chinta": { src: akshayChintaPortrait, focal: { x: 51, y: 41 } },
  "r-jayasurya": { src: rJayasuryaPortrait, focal: { x: 49, y: 44 } },
  "venkata-manidhar-reddy-d": { src: venkataManidharReddyDPortrait, focal: { x: 59, y: 39 } },
  "g-nikitha-reddy": { src: gNikithaReddyPortrait, focal: { x: 46, y: 49 } },
  "u-yuvan-chandra-uppaluru": { src: uYuvanChandraUppaluruPortrait, focal: { x: 52, y: 42 } },
  "m-yeshvandh-kumar": { src: mYeshvandhKumarPortrait, focal: { x: 50, y: 50 } },
  "u-siva-satya-bhargav-sri-ram": { src: uSivaSatyaBhargavSriRamPortrait, focal: { x: 49, y: 34 } },
  "n-bhanu-prasad": { src: nBhanuPrasadPortrait, focal: { x: 47, y: 36 } },
  "k-prema-himaja": { src: kPremaHimajaPortrait, focal: { x: 49, y: 34 } },
  "p-rohith": { src: pRohithPortrait, focal: { x: 56, y: 45 } },
  "g-likith-krishna": { src: gLikithKrishnaPortrait, focal: { x: 48, y: 41 } },
  "t-sree-lakshmi": { src: tSreeLakshmiPortrait, focal: { x: 49, y: 38 } },
  "m-hemashri": { src: mHemashriPortrait, focal: { x: 48, y: 40 } },
  "lak-kshwanthy-s": { src: lakKshwanthySPortrait, focal: { x: 51, y: 43 } },
  "chintapalli-g-v-s-s-p-n-sujith": { src: chintapalliGVSSPNSujithPortrait, focal: { x: 48, y: 40 } },
  "dasa-manisai": { src: dasaManisaiPortrait, focal: { x: 50, y: 39 } },
  "g-nani-prabhas": { src: gNaniPrabhasPortrait, focal: { x: 51, y: 46 } },
  "kunte-shashidhar-rao": { src: kunteShashidharRaoPortrait, focal: { x: 51, y: 45 } },
};

/* -------------------------------------------------------------------------- */
/* Queries & formatting                                                       */

const byId = new Map(members.map((m) => [m.id, m]));
const clubById = new Map(clubs.map((c) => [c.id, c]));

export const smtGroups: SmtGroup[] = ["Coordination", "Camera", "Post-production", "Analytics", "Writing", "On-screen"];

export function getMember(id: string) {
  return byId.get(id);
}

export function getClub(id: ClubId) {
  return clubById.get(id)!;
}

export function getLayer(id: LayerId) {
  return layers.find((l) => l.id === id)!;
}

export function membersInLayer(layer: LayerId) {
  return members.filter((m) => m.layer === layer);
}

export function clubLeaders(club: ClubId) {
  return members.filter((m) => m.club === club);
}

/** Unfilled positions in a club, if any. */
export function clubOpenRoles(club: ClubId) {
  return openRoles.filter((r) => r.club === club);
}

export const president = members.find((m) => m.layer === "president")!;
export const councilLeaders = membersInLayer("council");
export const smtMembers = membersInLayer("smt");

export function smtByGroup() {
  return smtGroups
    .map((group) => ({ group, members: smtMembers.filter((m) => m.smtGroup === group) }))
    .filter((g) => g.members.length > 0);
}

export const counts = {
  clubs: clubs.length,
  layers: layers.length,
  people: members.length,
  openRoles: openRoles.length,
  byLayer: Object.fromEntries(layers.map((l) => [l.id, membersInLayer(l.id).length])) as Record<LayerId, number>,
};

export function portraitOf(member: Member) {
  return portraits[member.id];
}

/** The people a profile can step through: same club, otherwise same layer. */
export function contextOf(member: Member) {
  return member.club ? clubLeaders(member.club) : membersInLayer(member.layer);
}

/** "Head · Coding Club" for club leaders, the plain role otherwise. */
export function roleLine(member: Member) {
  return member.club ? `${member.role} · ${getClub(member.club).name}` : member.role;
}

export function initials(name: string) {
  const words = name.split(/[\s.]+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** Heads first, then Vice Heads — used to group a club's leadership. */
export function isHeadRole(role: string) {
  return /^head\b/i.test(role);
}

export function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function portraitAlt(member: Member) {
  return `Portrait of ${member.name}, ${roleLine(member)}, ${council.name}`;
}

export function objectPosition(member: Member) {
  const p = portraitOf(member);
  return p ? `${p.focal.x}% ${p.focal.y}%` : "50% 35%";
}

/**
 * object-position keeping the face in frame inside a container wider than the
 * photo — for the BUNDLED portrait only. The math lives in coverPositionFrom so
 * an uploaded portrait (src/lib/team) runs through the same implementation;
 * components should use useCoverPosition(), which prefers an upload.
 */
export function coverPosition(member: Member, containerAspect: number, headroom = 4) {
  const p = portraitOf(member);
  return coverPositionFrom(
    p && { width: p.src.width, height: p.src.height, focal: p.focal },
    containerAspect,
    headroom,
  );
}

export type ProfileField = { key: string; label: string; value: string; href?: string };

/** Detail-view facts, skipping anything not supplied. */
export function profileFields(member: Member): ProfileField[] {
  const out: ProfileField[] = [{ key: "role", label: "Role", value: member.role }];
  if (member.club) out.push({ key: "club", label: "Club", value: getClub(member.club).name });
  out.push({ key: "layer", label: "Layer", value: `${getLayer(member.layer).label} · ${getLayer(member.layer).short}` });
  if (member.year) out.push({ key: "year", label: "Year", value: member.year });
  if (member.department) out.push({ key: "department", label: "Department", value: member.department });
  out.push({ key: "vtu", label: "VTU No.", value: member.vtu });
  out.push({ key: "email", label: "Email", value: member.email, href: `mailto:${member.email}` });
  return out;
}
