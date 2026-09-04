/**
 * Client-side check of the feedback draft, run before the POST.
 *
 * This is a COURTESY, not a control: `FeedbackSchema` on the server remains the
 * only thing that decides what is stored. Its purpose is to spare a student a
 * round trip and a scroll back up the page for something we already know.
 *
 * The bounds below deliberately mirror `schema.ts`. If you change one, change
 * both — a client that accepts what the server rejects is worse than no check
 * at all, because the error then arrives with no field attached.
 *
 * Pure: no I/O, no DOM.
 */

export interface FeedbackDraft {
  vtu: string;
  studentName: string;
  clubId: string;
  clubRating: number | null;
  activities: string;
  /** Optional by design — no opinion of a person is a valid answer. */
  headRating?: number | null;
  viceRating?: number | null;
}

export type FeedbackFieldErrors = Partial<Record<keyof FeedbackDraft, string>>;

/**
 * Every problem at once, so one pass through the form fixes all of them.
 * Messages name the fix rather than the failure.
 */
export function validateFeedbackDraft(draft: FeedbackDraft): FeedbackFieldErrors {
  const errors: FeedbackFieldErrors = {};

  const vtu = draft.vtu.trim();
  if (vtu.length < 3) errors.vtu = "Enter your VTU number.";
  else if (vtu.length > 20) errors.vtu = "That VTU number is too long.";

  const name = draft.studentName.trim();
  if (name.length < 2) errors.studentName = "Enter your name.";
  else if (name.length > 80) errors.studentName = "Shorten your name to 80 characters.";

  if (draft.clubId.trim().length === 0) errors.clubId = "Choose your club.";

  if (draft.clubRating == null) errors.clubRating = "Rate the club out of 5.";

  const activities = draft.activities.trim();
  if (activities.length < 5) errors.activities = "Tell us how the activities have been.";
  else if (activities.length > 4000) errors.activities = "Shorten this to 4000 characters.";

  return errors;
}
