export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
}

/** Break a remaining-milliseconds value into whole d/h/m/s (floored), clamped at 0. */
export function formatCountdown(msLeft: number): CountdownParts {
  if (msLeft <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, done: true };
  const totalSeconds = Math.floor(msLeft / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds, done: false };
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * "2d 04h 12m 05s" — drop only the leading zero units; the first shown unit is
 * unpadded, every later one is zero-padded. Seconds always show.
 */
export function countdownLabel(p: CountdownParts): string {
  const units: [number, string][] = [
    [p.days, "d"],
    [p.hours, "h"],
    [p.minutes, "m"],
    [p.seconds, "s"],
  ];
  const out: string[] = [];
  for (const [val, suffix] of units) {
    if (out.length === 0) {
      if (val === 0 && suffix !== "s") continue; // skip leading zero units
      out.push(`${val}${suffix}`); // first shown unit: no pad
    } else {
      out.push(`${pad(val)}${suffix}`);
    }
  }
  return out.join(" ");
}
