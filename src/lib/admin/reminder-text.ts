import { istDateMedium, istFullDate, istTimeRange } from "@/lib/datetime";

/**
 * The prefilled text behind the "Remind them it's coming up" button.
 *
 * Pure, and deliberately not a template: the head sees this in the compose box
 * and can edit it before sending. A mass mail cannot be recalled, so the last
 * word belongs to a person, not to this function.
 */
export interface ReminderEvent {
  title: string;
  startsAt: string;
  endsAt: string;
  isAllDay: boolean;
  venue: string | null;
}

export function reminderText(ev: ReminderEvent): { subject: string; body: string } {
  const subject = `Reminder: ${ev.title} is on ${istDateMedium(ev.startsAt)}`;
  const when = ev.isAllDay
    ? `${istFullDate(ev.startsAt)} (all day)`
    : `${istFullDate(ev.startsAt)}, ${istTimeRange(ev.startsAt, ev.endsAt)}`;
  // "TBA" matches what the public event pages already show for a venueless event.
  const where = ev.venue ?? "TBA";

  const body = [
    `Just a reminder that ${ev.title} is coming up.`,
    "",
    `When: ${when}`,
    `Where: ${where}`,
    "",
    "See you there.",
  ].join("\n");

  return { subject, body };
}
