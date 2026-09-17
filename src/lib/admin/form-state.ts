// Shared server-action result shapes. Kept out of the "use server" files
// themselves, which may only export async functions.

/**
 * One complaint per field, keyed by the input's `name`, rendered under that
 * input. Whole-form problems ("you can't send to that audience") stay in
 * `error` — they have no field to sit under.
 */
export type FieldErrors = Record<string, string>;

export interface LoginState {
  error?: string;
  fieldErrors?: FieldErrors;
  /** Seconds until the lockout lifts. Present only when rate-limited, and used
   *  by the login page to count down and re-enable the form. */
  retryAfterSeconds?: number;
}

export interface ForgotState {
  error?: string;
  fieldErrors?: FieldErrors;
  /** The neutral acknowledgement. Identical whether or not the address exists. */
  message?: string;
}

export interface ResetPasswordState {
  error?: string;
  fieldErrors?: FieldErrors;
  /** Shown once on success — the replacement recovery codes. */
  recoveryCodes?: string[];
}

export interface EventFormState {
  error?: string;
  fieldErrors?: FieldErrors;
}

export interface InviteCreateState {
  error?: string;
  fieldErrors?: FieldErrors;
  /** The generated accept-invite URL, shown once so the inviter can share it. */
  inviteUrl?: string;
}

export interface AcceptInviteState {
  error?: string;
  fieldErrors?: FieldErrors;
  /** Shown once on success — the admin's single-use TOTP recovery codes. */
  recoveryCodes?: string[];
}

export interface SetupTotpState {
  error?: string;
  fieldErrors?: FieldErrors;
  /** Shown once on success — new single-use recovery codes for the second factor. */
  recoveryCodes?: string[];
}

export interface AnnouncementFormState {
  error?: string;
  fieldErrors?: FieldErrors;
}

export interface ResourceFormState {
  error?: string;
  fieldErrors?: FieldErrors;
}

export interface ClubFormState {
  error?: string;
  fieldErrors?: FieldErrors;
}

export interface ContactHandledState {
  error?: string;
  fieldErrors?: FieldErrors;
}

export interface GalleryFormState {
  error?: string;
  fieldErrors?: FieldErrors;
}

export interface AchievementFormState {
  error?: string;
  fieldErrors?: FieldErrors;
}

export interface MemberFormState {
  error?: string;
  fieldErrors?: FieldErrors;
}

export interface SessionFormState {
  error?: string;
  fieldErrors?: FieldErrors;
}

export interface MemberInviteState {
  error?: string;
  fieldErrors?: FieldErrors;
  /** The generated accept-invite URL, shown once so the head can share it. */
  inviteUrl?: string;
}

export interface MemberSetupState {
  error?: string;
  fieldErrors?: FieldErrors;
}

export interface MemberLoginState {
  error?: string;
  fieldErrors?: FieldErrors;
}

export interface BroadcastState {
  error?: string;
  fieldErrors?: FieldErrors;
  /** How many addresses the send actually reached, shown once on success. */
  sent?: number;
}

/** What `previewAudienceAction` hands the picker: who an audience contains. */
export interface AudiencePreview {
  error?: string;
  recipients?: { email: string; name: string | null; meta: string | null }[];
  label?: string;
}

/** The council-wide composer (`/admin/email`), which can also queue. */
export interface ComposerState {
  error?: string;
  fieldErrors?: FieldErrors;
  /** Addresses mailed inline. */
  sent?: number;
  /** Rows queued for the Outbox to drain. */
  queued?: number;
  /** Returned INSTEAD of sending when the audience is large enough to confirm. */
  confirm?: { count: number; label: string };
}

export interface FeedbackToggleState {
  error?: string;
  fieldErrors?: FieldErrors;
}

export interface TeamLinksState {
  error?: string;
  fieldErrors?: FieldErrors;
  /** Set after a successful save so the row can confirm inline, without the whole
   *  page flashing — /admin/team saves one member at a time. */
  saved?: boolean;
}

/** The "Add someone" form on /admin/team. Separate from TeamLinksState because a
 *  successful add clears the form, where a successful save keeps its values. */
export interface TeamAddState {
  error?: string;
  fieldErrors?: FieldErrors;
  addedName?: string;
}
