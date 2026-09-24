// Maintenance mode for the public site.
//
// Flipped from the admin dashboard (the `site_settings` row, read through
// src/lib/maintenance-switch.ts) and enforced in src/proxy.ts, which runs
// before any page renders. The MAINTENANCE_MODE environment variable still
// overrides the switch as a break-glass control.
//
// /admin/* is exempt. Locking the council out of their own admin panel during
// maintenance is exactly backwards — maintenance is usually when they most
// need to get in.

/**
 * Used only when neither the env var nor the switch gives an answer — a cold
 * server instance that cannot reach the database. The switch is the source of
 * truth; this is its last-resort fallback, so it stays `false`.
 */
const DEFAULT_MAINTENANCE = false;

/**
 * MAINTENANCE_MODE as an override: `true`/`false` when it says something
 * recognisable, `null` otherwise. A typo or stray space is not an answer — it
 * falls through rather than silently meaning "off".
 */
export function parseMaintenanceFlag(value: string | undefined | null): boolean | null {
  const v = value?.trim().toLowerCase() ?? "";
  if (v === "1" || v === "true" || v === "on" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return null;
}

/**
 * Env override → admin switch → committed default. `switchValue` is `null`
 * when the switch could not be read and no earlier value is cached.
 */
export function resolveMaintenance(
  envValue: string | undefined | null,
  switchValue: boolean | null,
): boolean {
  return parseMaintenanceFlag(envValue) ?? switchValue ?? DEFAULT_MAINTENANCE;
}

/** Paths that stay reachable while maintenance is on. */
export function isExemptPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/**
 * The whole page, inline.
 *
 * It has to be one string: the proxy answers *every* public URL with it, so a
 * relative `<link>` or `<script src>` would 404 on any nested route
 * (`/events/123` would look for `/events/maintenance.css`). Web fonts are the
 * one external request, and the page falls back to system fonts if they fail.
 *
 * ⚠️ Being a template literal, the HTML must contain no backtick, no `${` and
 * no backslash — JS would eat the escape before the browser ever saw it. That
 * is why the page's own JS avoids regex escapes. `npm run test` pins this.
 */
const PAGE = `<!doctype html>
<html lang="en" data-theme="day">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#faf9f5" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#17190f" media="(prefers-color-scheme: dark)">
<title>Under maintenance &middot; CSE Club Council</title>
<meta name="description" content="The CSE Club Council site is down for scheduled maintenance and will be back shortly.">

<!--
  One self-contained file on purpose: while the site is down, every URL may be
  served this page, so relative links to separate CSS/JS files would break on
  nested routes like /events/123. Fonts are the only external request, and the
  page still works (with system fonts) if they can't load.
-->

<!--
  The same "theme" cookie the live site uses (src/app/layout.tsx resolves it
  server-side, src/components/ThemeToggle.tsx writes it), applied before paint
  so someone who chose night paper does not get a flash of day on the way in.

  Nothing in this file may contain a backslash, a backtick or a dollar-brace:
  it is inlined verbatim into a TS template literal in src/lib/maintenance.ts,
  which would eat them before the browser ever saw them. That rules out regex
  escapes, hence the hand-rolled cookie parse below.
-->
<script>
  (function () {
    var t = "";
    var parts = document.cookie.split(";");
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      if (p.indexOf("theme=") === 0) t = p.slice(6);
    }
    if (t !== "day" && t !== "night") t = matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "day";
    document.documentElement.setAttribute("data-theme", t);
  })();
</script>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=IBM+Plex+Mono:wght@400;500&family=Space+Grotesk:wght@400;500&display=swap">

<style>
  /* ------------------------------------------------------------------ tokens */
  :root {
    --paper: #faf9f5;
    --paper-2: #fdfdfa;
    --sand: #f1f0e7;
    --ink: #22241f;
    --ink-2: #5d6157;
    --ink-3: #8a8f80;
    --line-2: #e2e0d6;
    --line-3: #d8d5c8;
    --forest: #3f5e4c;
    --amber: #e0a458;
    --glow: rgba(224, 164, 88, .16);

    --serif: "DM Serif Display", Georgia, "Times New Roman", serif;
    --sans: "Space Grotesk", system-ui, -apple-system, "Segoe UI", sans-serif;
    --mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
    --ease: cubic-bezier(0.22, 1, 0.36, 1);
    --gutter: clamp(20px, 4.5vw, 56px);
    color-scheme: light;
  }
  [data-theme="night"] {
    --paper: #17190f;
    --paper-2: #1c1e15;
    --sand: #232519;
    --ink: #f1f0e7;
    --ink-2: #b9bcae;
    --ink-3: #8a8f80;
    --line-2: #343728;
    --line-3: #3d4130;
    --forest: #8fbb9c;
    --glow: rgba(224, 164, 88, .08);
    color-scheme: dark;
  }

  /* ------------------------------------------------------------------ base */
  *, *::before, *::after { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; background: var(--paper); }
  body {
    margin: 0;
    min-height: 100svh;
    display: flex; flex-direction: column;
    background: radial-gradient(60% 50% at 50% 28%, var(--glow), transparent 70%), var(--paper);
    color: var(--ink);
    font-family: var(--sans);
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
    overflow-x: clip;
    transition: background-color .5s var(--ease), color .5s var(--ease);
  }
  ::selection { background: var(--forest); color: var(--paper); }
  button { font: inherit; color: inherit; }
  :focus-visible { outline: 2px solid var(--forest); outline-offset: 3px; }
  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
  }
  .wrap { width: 100%; max-width: 1320px; margin: 0 auto; padding: 0 var(--gutter); }

  /* Film grain — the one texture on the page. */
  .grain {
    pointer-events: none; position: fixed; inset: -50%; z-index: 100;
    opacity: .06;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    animation: grain 1.2s steps(6) infinite;
  }
  [data-theme="night"] .grain { opacity: .09; }
  @keyframes grain {
    0% { transform: translate(0, 0); } 25% { transform: translate(-3%, 2%); }
    50% { transform: translate(2%, -3%); } 75% { transform: translate(3%, 3%); } 100% { transform: translate(0, 0); }
  }

  /* ------------------------------------------------------------------ header */
  header.top {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    padding-top: max(20px, env(safe-area-inset-top)); padding-bottom: 12px;
  }
  .brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
  /* Same mark as the site header (globals.css .brand-mark). Root-absolute so it
     resolves from any nested URL; proxy.ts's matcher excludes .png, so it is
     still served while maintenance is on. */
  .brand-mark {
    flex: none; width: 30px; height: 34px; background-color: currentColor;
    -webkit-mask: url(/logo-mark.png) center / contain no-repeat;
    mask: url(/logo-mark.png) center / contain no-repeat;
  }
  .brand span { font-family: var(--serif); font-size: 20px; line-height: 1; white-space: nowrap; }
  .icon-btn {
    display: grid; place-items: center; width: 44px; height: 44px; flex: none;
    border: 1px solid var(--line-3); border-radius: 999px; background: transparent;
    cursor: pointer; transition: background-color .2s, transform .3s var(--ease);
  }
  .icon-btn:hover { background: var(--sand); }
  .icon-btn:active { transform: scale(.94); }
  .icon-btn svg { width: 18px; height: 18px; }
  .icon-btn .sun { display: none; }
  [data-theme="night"] .icon-btn .sun { display: block; }
  [data-theme="night"] .icon-btn .moon { display: none; }

  /* ------------------------------------------------------------------ hero */
  main { flex: 1; display: flex; flex-direction: column; }
  .hero {
    position: relative; z-index: 1;
    display: flex; flex-direction: column; align-items: center; text-align: center;
    padding-top: clamp(24px, 5svh, 64px); padding-bottom: clamp(16px, 2.6svh, 28px);
    container-type: inline-size;
  }

  .badge {
    display: inline-flex; align-items: center; gap: 10px;
    height: 34px; margin: 0 0 clamp(18px, 2.8svh, 28px); padding: 0 14px 0 12px;
    border: 1px solid var(--line-3); border-radius: 999px;
    font-family: var(--mono); font-size: 11.5px; font-weight: 500; letter-spacing: .16em; text-transform: uppercase; color: var(--ink-2);
  }
  .badge i { position: relative; width: 7px; height: 7px; border-radius: 50%; background: var(--amber); flex: none; }
  .badge i::after {
    content: ""; position: absolute; inset: -5px; border-radius: 50%;
    border: 1.5px solid var(--amber); animation: ping 2s var(--ease) infinite;
  }
  @keyframes ping { 0% { transform: scale(.4); opacity: .9; } 100% { transform: scale(1.5); opacity: 0; } }

  h1 {
    margin: 0; width: 100%;
    font-family: var(--serif); font-weight: 400;
    font-size: clamp(2.2rem, 6vw, 4.9rem); line-height: 1.02; letter-spacing: -.012em;
  }
  /* Longest phrase is ~10em; fit it to the column and to short (landscape) screens. */
  @supports (font-size: 1cqi) { h1 { font-size: min(4.9rem, 9.3cqi, 10svh); } }
  h1 .line { display: block; }
  .rot {
    position: relative; display: block;
    height: 1.16em; margin-bottom: -.08em;
    overflow: hidden; white-space: nowrap;
  }
  .rot span {
    position: absolute; left: 0; right: 0; top: 0;
    transform: translateY(125%); opacity: 0;
    transition: transform .9s var(--ease), opacity .9s var(--ease);
  }
  .rot span.on { transform: translateY(0); opacity: 1; }
  .rot span.out { transform: translateY(-125%); opacity: 0; }
  .rot em { color: var(--forest); }

  .lead {
    margin: clamp(16px, 2.4svh, 24px) 0 0; max-width: 35rem;
    font-size: clamp(16px, 1.35vw, 18px); color: var(--ink-2);
    text-wrap: balance;
  }
  .lead strong { color: var(--ink); font-weight: 500; }

  .actions { display: flex; flex-direction: column; align-items: center; gap: 14px; margin-top: clamp(20px, 3svh, 30px); max-width: 100%; }
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 10px;
    height: 50px; padding: 0 26px; border: 0; border-radius: 999px;
    background: var(--ink); color: var(--paper);
    font-size: 15px; font-weight: 500; cursor: pointer;
    box-shadow: 0 12px 30px -16px rgba(0, 0, 0, .6);
    transition: transform .35s var(--ease);
  }
  .btn svg { width: 17px; height: 17px; transition: transform .7s var(--ease); }
  .btn:hover { transform: translateY(-2px); }
  .btn:hover svg { transform: rotate(-180deg); }
  .btn:active { transform: scale(.97); }

  /* One quiet line of what the clubs are "doing" — the fun, at a whisper. */
  .ticker-line {
    height: 20px; margin: 0;
    font-family: var(--mono); font-size: 12px; letter-spacing: .02em; color: var(--ink-3);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;
  }
  .ticker-line b { font-weight: 500; color: var(--ink-2); }
  .ticker-line .ok { color: var(--forest); }
  .caret { display: inline-block; width: .55em; height: 1em; margin-left: 2px; vertical-align: -.15em; background: var(--amber); animation: blink 1s steps(1) infinite; }
  @keyframes blink { 50% { opacity: 0; } }

  /* ------------------------------------------------------------------ the floor (sticker pile) */
  .play { position: relative; z-index: 5; flex: 1; display: flex; flex-direction: column; min-height: clamp(230px, 30svh, 420px); overflow-x: clip; }
  .pit {
    position: relative; flex: 1;
    min-height: 170px;
    touch-action: pan-y;
    user-select: none; -webkit-user-select: none;
  }
  /* Hairline floor with fine ruler ticks, edge to edge. */
  .pit::after {
    content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 9px;
    border-bottom: 1px solid var(--ink);
    background:
      repeating-linear-gradient(90deg, var(--ink-3) 0 1px, transparent 1px 48px) 0 100% / 100% 9px no-repeat,
      repeating-linear-gradient(90deg, var(--line-3) 0 1px, transparent 1px 12px) 0 100% / 100% 4px no-repeat;
    opacity: .7;
    pointer-events: none;
  }
  .sticker {
    position: absolute; left: 0; top: 0;
    will-change: transform; touch-action: none; cursor: grab;
    filter: drop-shadow(0 6px 10px rgba(34, 36, 31, .18));
  }
  [data-theme="night"] .sticker { filter: drop-shadow(0 8px 12px rgba(0, 0, 0, .45)); }
  .sticker svg { display: block; width: 100%; height: 100%; overflow: visible; transition: transform .35s var(--ease); }
  .sticker.held { cursor: grabbing; filter: drop-shadow(0 18px 22px rgba(34, 36, 31, .28)); }
  .sticker.held svg { transform: scale(1.06); }
  .sticker .rim { font-family: var(--mono); font-weight: 500; font-size: 19px; letter-spacing: 2.6px; }
  .sticker .num { font-family: var(--mono); font-size: 14px; letter-spacing: 1.5px; }
  .pit:not(.ready) .sticker { visibility: hidden; }

  .toast {
    position: absolute; left: 50%; top: 8px; z-index: 2;
    display: flex; align-items: center; gap: 12px;
    width: max-content; max-width: calc(100% - 32px);
    padding: 10px 18px 10px 12px; border-radius: 16px;
    background: var(--ink); color: var(--paper); text-align: left;
    box-shadow: 0 18px 40px -18px rgba(0, 0, 0, .6);
    transform: translate(-50%, -12px); opacity: 0;
    transition: transform .5s var(--ease), opacity .4s var(--ease);
    pointer-events: none;
  }
  .toast.show { transform: translate(-50%, 0); opacity: 1; }
  .toast i { width: 12px; height: 12px; border-radius: 50%; flex: none; box-shadow: 0 0 0 2px rgba(255, 255, 255, .25); }
  .toast b { display: block; font-family: var(--serif); font-weight: 400; font-size: 18px; line-height: 1.15; }
  .toast span { display: block; font-size: 13px; opacity: .75; line-height: 1.35; }

  .floor-row {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    padding-top: 10px; padding-bottom: 2px;
  }
  .hint { margin: 0; font-family: var(--mono); font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: var(--ink-3); }
  .tools { display: flex; gap: 8px; }
  .tools .icon-btn[aria-pressed="true"] { background: var(--ink); color: var(--paper); border-color: var(--ink); }
  .tools .icon-btn[hidden] { display: none; }

  /* ------------------------------------------------------------------ footer */
  footer.foot {
    display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 6px 24px;
    padding-top: 6px; padding-bottom: max(18px, env(safe-area-inset-bottom));
    font-size: 13px; color: var(--ink-3);
  }
  footer.foot p { margin: 0; text-wrap: balance; }
  footer.foot a {
    color: var(--ink-2); text-decoration: underline; text-decoration-color: var(--line-3);
    text-underline-offset: 3px; transition: color .2s, text-decoration-color .2s;
  }
  footer.foot a:hover { color: var(--ink); text-decoration-color: currentColor; }
  footer.foot .small { font-family: var(--mono); font-size: 11px; letter-spacing: .14em; text-transform: uppercase; }

  /* ------------------------------------------------------------------ entrance */
  .rise { animation: rise 1s var(--ease) both; animation-delay: var(--d, 0ms); }
  @keyframes rise { from { opacity: 0; transform: translateY(18px); } }

  /* ------------------------------------------------------------------ small screens */
  @media (max-width: 560px) {
    .brand span { font-size: 18px; }
    .play { min-height: 340px; }
    .hint { font-size: 11px; letter-spacing: .1em; }
    .hint .more { display: none; }
    footer.foot { flex-direction: column; }
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: .01ms !important; animation-iteration-count: 1 !important;
      animation-delay: 0ms !important; transition-duration: .01ms !important;
    }
    .grain { display: none; }
  }
</style>
</head>

<body>
  <div class="grain" aria-hidden="true"></div>

  <header class="top wrap">
    <span class="brand" aria-label="CSE Club Council">
      <i class="brand-mark" aria-hidden="true"></i>
      <span>CSE Club Council</span>
    </span>
    <button class="icon-btn" type="button" id="theme" aria-label="Switch between day and night theme">
      <svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/></svg>
      <svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
    </button>
  </header>

  <main>
    <section class="hero wrap" aria-labelledby="title">
      <p class="badge rise" style="--d:60ms"><i aria-hidden="true"></i>Under maintenance</p>

      <h1 id="title">
        <span class="line rise" style="--d:140ms">Hold tight &mdash;</span>
        <span class="rot rise" style="--d:220ms" aria-hidden="true" id="rot">
          <span class="on">we&rsquo;re <em>squashing bugs.</em></span>
          <span>we&rsquo;re <em>tuning things up.</em></span>
          <span>we&rsquo;re <em>polishing pixels.</em></span>
          <span>we&rsquo;re <em>levelling up.</em></span>
          <span>we&rsquo;re <em>fixing the wiring.</em></span>
        </span>
        <span class="sr-only">we&rsquo;re working on the site.</span>
      </h1>

      <p class="lead rise" style="--d:320ms">
        <strong>The site is down for scheduled maintenance.</strong>
        We&rsquo;ll be back shortly, and nothing you&rsquo;ve submitted has been lost.
      </p>

      <div class="actions rise" style="--d:400ms">
        <button class="btn" type="button" id="retry">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M8 16H3v5"/></svg>
          Try again
        </button>
        <p class="ticker-line" id="line" aria-hidden="true">&nbsp;</p>
      </div>
    </section>

    <section class="play" aria-label="Club stickers you can throw around while you wait">
      <div class="pit" id="pit">
        <div class="toast" id="toast" role="status" aria-live="polite"><i></i><div><b></b><span></span></div></div>
      </div>
      <div class="floor-row wrap">
        <p class="hint">Drag &middot; throw &middot; tap<span class="more"> to meet a club</span></p>
        <div class="tools">
          <button class="icon-btn" type="button" id="tilt" aria-pressed="false" aria-label="Tilt your phone to move the stickers" title="Tilt mode" hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g transform="rotate(-14 12 12)"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11.5 18h1"/></g></svg>
          </button>
          <button class="icon-btn" type="button" id="shake" aria-label="Shake the stickers" title="Shake them up">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/><path d="m18 14 4 4-4 4"/></svg>
          </button>
        </div>
      </div>
    </section>
  </main>

  <footer class="foot wrap">
    <p>Something emergency? Contact <a href="https://cse-ccc.vercel.app/team">Technical Head / Vice President / President</a> &middot; <a href="https://cse-ccc.vercel.app/contact">Contact page</a></p>
    <p class="small">CSE Club Council &middot; <span id="year">2026</span></p>
  </footer>

<script>
(function () {
  "use strict";

  var reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (s) { return document.querySelector(s); };
  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /* ---------------------------------------------------------------- data */
  // Taglines are verbatim from each club's card on cse-ccc.vercel.app/clubs.
  var CLUBS = [
    { n: 1,  name: "Coding",           full: "Coding Club",                          tag: "Contribution nights, ladder contests, ICPC training.",             bg: "#22241f", fg: "#f1f0e7", glyph: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>' },
    { n: 2,  name: "Innovation",       full: "Innovation Club",                      tag: "Build weekends, prototyping jams and demo days.",                  bg: "#e0a458", fg: "#22241f", glyph: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/>' },
    { n: 3,  name: "CyberSentinel",    full: "CyberSentinel Club",                   tag: "CTFs, wargames and responsible-disclosure practice.",             bg: "#3f5e4c", fg: "#f1f0e7", glyph: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>' },
    { n: 4,  name: "Animatrix",        full: "Animatrix Club",                       tag: "Motion, 3D and the annual showreel night.",                       bg: "#8c3b2b", fg: "#f1f0e7", glyph: '<rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3z"/>' },
    { n: 5,  name: "Magazine",         full: "Magazine Club",                        tag: "The department magazine, from pitch to print.",                   bg: "#f1f0e7", fg: "#22241f", glyph: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>' },
    { n: 6,  name: "Fashion & Fusion", full: "Fashion & Fusion Club",                tag: "Styling, choreography and the annual runway.",                    bg: "#e8b4a6", fg: "#22241f", glyph: '<path d="M10 5a2 2 0 1 1 2 2v2"/><path d="M12 9 3.3 16.4c-.8.7-.4 1.6.6 1.6h16.2c1 0 1.4-.9.6-1.6z"/>' },
    { n: 7,  name: "Nature",           full: "Nature Club",                          tag: "Trails, clean-ups and campus biodiversity walks.",                bg: "#8fbb9c", fg: "#22241f", glyph: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z"/><path d="M2 21c0-3 1.9-5.4 5.2-6.1C9.5 14.4 12 13 13 12"/>' },
    { n: 8,  name: "Yoga",             full: "Yoga Club",                            tag: "Morning sessions on the lawn, all levels welcome.",               bg: "#c9ccbf", fg: "#22241f", glyph: '<circle cx="12" cy="4.5" r="2"/><path d="M12 7.5v5"/><path d="M4 11.5c3 1.5 5.5 1.5 8 1s5-.5 8-1"/><path d="M6 20c2-2.5 4-3.5 6-3.5s4 1 6 3.5"/>' },
    { n: 9,  name: "AspireX",          full: "AspireX Club",                         tag: "Placement prep, mock interviews and alumni talks.",               bg: "#8c5a2b", fg: "#f1f0e7", glyph: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>' },
    { n: 10, name: "AppNova",          full: "AppNova Club",                         tag: "Ideas into Apps, Built and Shipped in Public.",                   bg: "#2f4739", fg: "#8fbb9c", glyph: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>' },
    { n: 11, name: "Short Film",       full: "Short Film & Movie Appreciation Club", tag: "Create. Capture. Inspire.",                                       bg: "#15160f", fg: "#e0a458", glyph: '<path d="M4 11v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8z"/><path d="m4 11-.9-3.7a2 2 0 0 1 1.5-2.4L16 2.3a2 2 0 0 1 2.4 1.5L19 6.7z"/><path d="m6.6 4.4 3.1 3.9"/><path d="m12.4 3 3.1 4"/>' },
    { n: 12, name: "AI Forge",         full: "AI Forge",                             tag: "Ai For All",                                                      bg: "#d2a16b", fg: "#22241f", glyph: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>' },
    { n: 13, name: "NetForge",         full: "NetForge",                             tag: "Learn the Networks. Build the Infrastructure. Forge the Future.", bg: "#3d4f5c", fg: "#f1f0e7", glyph: '<rect x="9" y="2" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="16" y="16" width="6" height="6" rx="1"/><path d="M5 16v-3h14v3"/><path d="M12 12V8"/>' }
  ];

  // What each club is "doing" right now. Jokes, not a real status.
  var TASKS = [
    ["Coding Club", "squashing the last bug"],
    ["Nature Club", "watering the servers"],
    ["Yoga Club", "stretching the database"],
    ["CyberSentinel", "double-checking the locks"],
    ["Magazine Club", "proofreading the 404s"],
    ["Fashion & Fusion", "restyling every button"],
    ["Short Film", "re-shooting the loading screen"],
    ["AI Forge", "teaching the model patience"],
    ["NetForge", "re-cabling the routers"],
    ["AppNova", "shipping the hotfix"],
    ["Animatrix", "keyframing the comeback"],
    ["AspireX", "prepping for the return interview"],
    ["Innovation Club", "prototyping plan B"]
  ];

  /* ---------------------------------------------------------------- small bits */
  // Written exactly as ThemeToggle.tsx writes it, so a theme chosen while the
  // site is down is still in force once it comes back up.
  $("#theme").addEventListener("click", function () {
    var next = document.documentElement.getAttribute("data-theme") === "night" ? "day" : "night";
    document.documentElement.setAttribute("data-theme", next);
    document.cookie = "theme=" + next + "; path=/; max-age=31536000; samesite=lax";
  });
  $("#retry").addEventListener("click", function () { location.reload(); });
  $("#year").textContent = new Date().getFullYear();

  /* ---------------------------------------------------------------- rotating headline */
  (function () {
    var words = $("#rot").querySelectorAll(":scope > span");
    var i = 0;
    if (reduceMotion) return;
    setInterval(function () {
      if (document.hidden) return;
      var cur = words[i];
      i = (i + 1) % words.length;
      var next = words[i];
      cur.classList.remove("on"); cur.classList.add("out");
      next.classList.remove("out"); next.classList.add("on");
      setTimeout(function () { cur.classList.remove("out"); }, 900);
    }, 3000);
  })();

  /* ---------------------------------------------------------------- one-line status */
  (function () {
    var el = $("#line");
    var queue = shuffle(TASKS.slice()), q = 0;
    function render(t, text, done, caret) {
      el.innerHTML = "&rsaquo; <b>" + esc(t[0]) + "</b> " + esc(text) +
        (caret ? '<span class="caret"></span>' : "") + (done ? ' <span class="ok">&#10003;</span>' : "");
    }
    if (reduceMotion) { render(queue[0], queue[0][1], true, false); return; }
    function next() {
      if (document.hidden) return setTimeout(next, 800);
      if (q >= queue.length) { queue = shuffle(TASKS.slice()); q = 0; }
      var t = queue[q++], k = 0;
      (function type() {
        render(t, t[1].slice(0, k), false, true);
        if (k++ < t[1].length) return setTimeout(type, 28 + Math.random() * 34);
        setTimeout(function () {
          render(t, t[1], true, false);
          setTimeout(next, 1700);
        }, 500);
      })();
    }
    setTimeout(next, 1100);
  })();

  /* ---------------------------------------------------------------- sticker physics */
  (function () {
    var pit = $("#pit");
    var G = 2300;             // px/s²
    var REST = 0.34;          // bounciness
    var gravity = { x: 0, y: G };
    var W = 0, H = 0, R = 50, CEIL = 0;
    var bodies = [];
    var held = null;
    var raf = 0, last = 0, still = 0, visible = false, started = false;

    function measure() {
      W = pit.clientWidth;
      H = pit.clientHeight - 1;
      // Stickers can fly anywhere on the page, but not off the top of it.
      CEIL = -(pit.getBoundingClientRect().top + scrollY);
      // Big enough to read, small enough that the pile stays on the floor.
      R = W < 640
        ? Math.max(30, Math.min(42, W / 10, H / 6.2))
        : Math.max(30, Math.min(60, W / 21, H / 4.4));
    }

    function sticker(c) {
      var id = "rim" + c.n;
      var el = document.createElement("div");
      el.className = "sticker";
      el.setAttribute("aria-hidden", "true");
      el.innerHTML =
        '<svg viewBox="0 0 200 200">' +
          '<defs><path id="' + id + '" d="M 30 100 A 70 70 0 1 1 170 100 A 70 70 0 1 1 30 100" /></defs>' +
          '<circle cx="100" cy="100" r="98" fill="#fbfaf4" />' +
          '<circle cx="100" cy="100" r="90" fill="' + c.bg + '" />' +
          '<circle cx="100" cy="100" r="80" fill="none" stroke="' + c.fg + '" stroke-opacity=".35" stroke-width="1.5" stroke-dasharray="3 5" />' +
          '<text class="rim" fill="' + c.fg + '" text-anchor="middle"><textPath href="#' + id + '" startOffset="25%">' + esc(c.name.toUpperCase()) + "</textPath></text>" +
          '<g transform="translate(70 66) scale(2.5)" fill="none" stroke="' + c.fg + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + c.glyph + "</g>" +
          '<text class="num" x="100" y="160" text-anchor="middle" fill="' + c.fg + '" fill-opacity=".7">N&ordm; ' + (c.n < 10 ? "0" : "") + c.n + "</text>" +
        "</svg>";
      pit.appendChild(el);
      return el;
    }

    function build() {
      measure();
      // Drop order is shuffled so the rain looks different every visit.
      bodies = shuffle(CLUBS.slice()).map(function (c, i) {
        var k = 0.9 + ((c.n * 37) % 23) / 100;     // stable size variety, 0.90–1.12
        var r = R * k;
        var b = {
          c: c, k: k, r: r, m: r * r,
          x: r + Math.random() * Math.max(1, W - 2 * r),
          y: CEIL - r - i * r * 1.25,                // above the top of the page, staggered
          vx: (Math.random() - 0.5) * 120, vy: 0,
          a: (Math.random() - 0.5) * 1.2, av: (Math.random() - 0.5) * 3,
          inside: false
        };
        b.el = sticker(c);
        b.el.style.width = b.el.style.height = (r * 2) + "px";
        return b;
      });
    }

    function walls(b) {
      if (b.y > H - b.r) {
        b.y = H - b.r;
        if (b.vy > 0) b.vy = b.vy > 140 ? -b.vy * REST : 0;
        b.vx *= 0.985;
        b.av = b.vx / b.r;                         // roll along the floor
      }
      if (b.y > CEIL + b.r) b.inside = true;
      if (b.inside && b.y < CEIL + b.r) { b.y = CEIL + b.r; if (b.vy < 0) b.vy = -b.vy * REST; }
      if (b.x < b.r) { b.x = b.r; if (b.vx < 0) b.vx = -b.vx * REST; }
      if (b.x > W - b.r) { b.x = W - b.r; if (b.vx > 0) b.vx = -b.vx * REST; }
    }

    function collide(a, b) {
      var dx = b.x - a.x, dy = b.y - a.y;
      var rs = a.r + b.r, d2 = dx * dx + dy * dy;
      if (d2 >= rs * rs || d2 === 0) return;
      var d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
      var ia = a === held ? 0 : 1 / a.m, ib = b === held ? 0 : 1 / b.m, sum = ia + ib;
      if (!sum) return;
      var over = rs - d;
      a.x -= nx * over * ia / sum; a.y -= ny * over * ia / sum;
      b.x += nx * over * ib / sum; b.y += ny * over * ib / sum;
      var rvx = b.vx - a.vx, rvy = b.vy - a.vy;
      var vn = rvx * nx + rvy * ny;
      if (vn >= 0) return;
      var e = vn < -120 ? REST : 0;                // no micro-bouncing in a resting pile
      var j = -(1 + e) * vn / sum;
      a.vx -= j * nx * ia; a.vy -= j * ny * ia;
      b.vx += j * nx * ib; b.vy += j * ny * ib;
      var tx = -ny, ty = nx, vt = rvx * tx + rvy * ty;   // contact friction, which also spins them
      var jt = -vt * 0.18 / sum;
      a.vx -= jt * tx * ia; a.vy -= jt * ty * ia;
      b.vx += jt * tx * ib; b.vy += jt * ty * ib;
      if (a !== held) a.av += vt / a.r * 0.12;
      if (b !== held) b.av += vt / b.r * 0.12;
      // A sticker perched on top of another rolls off, so the pile settles into
      // a natural heap instead of balancing in columns.
      if (Math.abs(nx) < 0.35) {
        var top = ny > 0 ? a : b, low = top === a ? b : a;
        if (top !== held) top.vx += ((top.x - low.x) || (Math.random() - 0.5)) > 0 ? 28 : -28;
      }
    }

    function step(dt) {
      var i, j, b;
      for (i = 0; i < bodies.length; i++) {
        b = bodies[i];
        if (b === held) continue;
        b.vx += gravity.x * dt; b.vy += gravity.y * dt;
        b.vx *= 0.9994; b.vy *= 0.9994; b.av *= 0.992;
        b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.av * dt;
      }
      for (var it = 0; it < 3; it++) {
        for (i = 0; i < bodies.length; i++) for (j = i + 1; j < bodies.length; j++) collide(bodies[i], bodies[j]);
        for (i = 0; i < bodies.length; i++) walls(bodies[i]);
      }
    }

    function draw() {
      for (var i = 0; i < bodies.length; i++) {
        var b = bodies[i];
        b.el.style.transform = "translate3d(" + (b.x - b.r).toFixed(1) + "px," + (b.y - b.r).toFixed(1) + "px,0) rotate(" + b.a.toFixed(3) + "rad)";
      }
    }

    function frame(t) {
      raf = 0;
      var dt = Math.min(1 / 30, (t - last) / 1000 || 1 / 60);
      last = t;
      for (var s = 0; s < 4; s++) step(dt / 4);
      draw();
      var moving = !!held;
      for (var i = 0; i < bodies.length && !moving; i++) {
        var b = bodies[i];
        if (Math.abs(b.vx) + Math.abs(b.vy) > 12 || !b.inside) moving = true;
      }
      still = moving ? 0 : still + 1;
      if (still < 45 && visible) raf = requestAnimationFrame(frame);   // sleep once the pile settles
    }

    function wake() {
      still = 0;
      if (!raf && visible) { last = performance.now(); raf = requestAnimationFrame(frame); }
    }

    /* ---------- pointer: grab, drag, fling, tap */
    var grab = null;
    function local(e) {
      var r = pit.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() };
    }
    pit.addEventListener("pointerdown", function (e) {
      var el = e.target.closest(".sticker");
      if (!el) return;
      var b = bodies.find(function (x) { return x.el === el; });
      var p = local(e);
      held = b; b.inside = true;
      grab = { id: e.pointerId, dx: p.x - b.x, dy: p.y - b.y, start: p, prev: p, moved: false };
      el.setPointerCapture(e.pointerId);
      el.classList.add("held");
      e.preventDefault();
      wake();
    });
    pit.addEventListener("pointermove", function (e) {
      if (!held || !grab || e.pointerId !== grab.id) return;
      var p = local(e);
      var nx = Math.max(held.r, Math.min(W - held.r, p.x - grab.dx));
      var ny = Math.max(CEIL + held.r, Math.min(H - held.r, p.y - grab.dy));
      var dt = Math.max(8, p.t - grab.prev.t) / 1000;
      held.vx = held.vx * 0.4 + ((nx - held.x) / dt) * 0.6;
      held.vy = held.vy * 0.4 + ((ny - held.y) / dt) * 0.6;
      held.av = held.vx / held.r * 0.35;
      held.x = nx; held.y = ny;
      if (Math.abs(p.x - grab.start.x) + Math.abs(p.y - grab.start.y) > 8) grab.moved = true;
      grab.prev = p;
      wake();
    });
    function release(e) {
      if (!held || !grab || e.pointerId !== grab.id) return;
      var b = held;
      b.el.classList.remove("held");
      if (!grab.moved) {
        // A tap: hop, spin, and introduce the club.
        b.vy = -900 - Math.random() * 300; b.vx = (Math.random() - 0.5) * 300; b.av = (Math.random() - 0.5) * 16;
        toast(b.c);
      } else if (performance.now() - grab.prev.t > 90) {
        b.vx *= 0.2; b.vy *= 0.2;                  // held still before letting go: just drop it
      }
      var max = 3200;
      b.vx = Math.max(-max, Math.min(max, b.vx));
      b.vy = Math.max(-max, Math.min(max, b.vy));
      held = null; grab = null;
      wake();
    }
    pit.addEventListener("pointerup", release);
    pit.addEventListener("pointercancel", release);

    /* ---------- toast */
    var toastEl = $("#toast"), toastTimer = 0;
    function toast(c) {
      toastEl.querySelector("i").style.background = c.bg;
      toastEl.querySelector("b").textContent = c.full;
      toastEl.querySelector("span").textContent = c.tag;
      toastEl.classList.add("show");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 3400);
    }

    /* ---------- shake + tilt */
    $("#shake").addEventListener("click", function () {
      bodies.forEach(function (b) {
        b.inside = true;
        b.vy -= 1000 + Math.random() * 900;
        b.vx += (Math.random() - 0.5) * 1400;
        b.av += (Math.random() - 0.5) * 22;
      });
      wake();
    });

    var tiltBtn = $("#tilt"), tilting = false;
    if ("DeviceOrientationEvent" in window && matchMedia("(pointer: coarse)").matches) tiltBtn.hidden = false;
    function onTilt(e) {
      if (e.beta == null || e.gamma == null) return;
      var x = Math.sin(e.gamma * Math.PI / 180), y = Math.sin(e.beta * Math.PI / 180);
      var angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      var t;
      if (angle === 90) { t = x; x = y; y = -t; }
      else if (angle === -90 || angle === 270) { t = x; x = -y; y = t; }
      else if (angle === 180) { x = -x; y = -y; }
      gravity.x = x * G; gravity.y = y * G;
      wake();
    }
    tiltBtn.addEventListener("click", function () {
      if (tilting) {
        tilting = false;
        window.removeEventListener("deviceorientation", onTilt);
        gravity.x = 0; gravity.y = G;
        tiltBtn.setAttribute("aria-pressed", "false");
        wake();
        return;
      }
      var start = function () {
        tilting = true;
        bodies.forEach(function (b) { b.inside = true; });
        window.addEventListener("deviceorientation", onTilt);
        tiltBtn.setAttribute("aria-pressed", "true");
      };
      // iOS asks for permission, and only from a tap.
      if (typeof DeviceOrientationEvent.requestPermission === "function") {
        DeviceOrientationEvent.requestPermission().then(function (s) { if (s === "granted") start(); }).catch(function () {});
      } else start();
    });

    /* ---------- lifecycle */
    function begin() {
      if (started) return;
      started = true;
      build();
      if (reduceMotion) {
        // Settle the pile off-screen, then show it at rest — no falling animation.
        bodies.forEach(function (b, i) { b.inside = true; b.y = H - b.r - (i % 3) * b.r; });
        for (var s = 0; s < 1200; s++) step(1 / 120);
        bodies.forEach(function (b) { b.vx = b.vy = b.av = 0; });
      }
      draw();
      pit.classList.add("ready");
      wake();
    }

    new ResizeObserver(function () {
      var oldR = R;
      measure();
      if (!started) return;
      var scale = R / oldR;
      bodies.forEach(function (b) {
        b.r = R * b.k; b.m = b.r * b.r;
        b.el.style.width = b.el.style.height = (b.r * 2) + "px";
        b.x = Math.max(b.r, Math.min(W - b.r, b.x * (scale || 1)));
        b.y = Math.min(H - b.r, b.y);
      });
      draw();
      wake();
    }).observe(pit);

    // Animate only while the floor is on screen. The first time it appears, the
    // stickers rain down past the headline and pile up.
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible && !started) setTimeout(begin, reduceMotion ? 0 : 650);
      else if (visible) wake();
    }, { threshold: 0.1 }).observe(pit);

    document.addEventListener("visibilitychange", function () { if (!document.hidden) wake(); });
  })();
})();
</script>
</body>
</html>
`;

/**
 * A complete 503 that touches nothing behind it. `Retry-After` and `noindex`
 * matter more than they look: without them a crawler can cache the maintenance
 * page as the site's real content, and the outage outlives itself in search
 * results.
 */
export function maintenanceResponse(): Response {
  return new Response(PAGE, {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, must-revalidate",
      "retry-after": "3600",
      "x-robots-tag": "noindex",
    },
  });
}
