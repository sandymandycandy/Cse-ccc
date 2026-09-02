/**
 * On a team event the person filling in the form is the team leader, so the
 * identity block at the top is labelled as theirs field by field: "Team leader
 * full name", "Team leader roll number".
 */

/**
 * A club writes its own field labels, so prefix defensively: leave a label that
 * already names the leader alone, drop a redundant leading "member" /
 * "team member" rather than stacking words, and only lowercase the leading word
 * when it isn't an acronym — so "VTU number" keeps its capitals.
 */
export function leaderLabel(label: string): string {
  const trimmed = label.trim();
  if (/^team\s+leader\b/i.test(trimmed)) return trimmed;
  const base = trimmed.replace(/^\s*(team\s+)?members?['’]?s?\s+/i, "").trim() || trimmed;
  const [first] = base.split(" ");
  const isAcronym = first !== first.charAt(0) + first.slice(1).toLowerCase();
  return `Team leader ${isAcronym ? base : base.charAt(0).toLowerCase() + base.slice(1)}`;
}
