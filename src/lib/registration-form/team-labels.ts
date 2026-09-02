/**
 * Labels for a team roster's rows.
 *
 * Row 0 is the team leader by convention (the API stores team answers as an
 * ordered array), so the form says so outright rather than leaving it implied
 * by position: "Team leader name", "Team leader VTU number".
 */

/** "Team leader" / "Member 2" / "Member 3" … — row 0 is always the leader. */
export function memberHeading(index: number): string {
  return index === 0 ? "Team leader" : `Member ${index + 1}`;
}

/**
 * A club writes its own member-field labels, so prefixing blindly would stack
 * words ("Team leader team member name"). Drop any leading "member" /
 * "team member" first, then lowercase the leading word — unless it is an
 * acronym, so "VTU number" keeps its capitals.
 */
export function leaderLabel(label: string): string {
  const base = label.replace(/^\s*(team\s+)?members?['’]?s?\s+/i, "").trim() || label;
  const [first] = base.split(" ");
  const isAcronym = first !== first.charAt(0) + first.slice(1).toLowerCase();
  return `Team leader ${isAcronym ? base : base.charAt(0).toLowerCase() + base.slice(1)}`;
}
