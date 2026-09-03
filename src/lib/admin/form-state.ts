// Shared server-action result shapes. Kept out of the "use server" files
// themselves, which may only export async functions.

export interface LoginState {
  error?: string;
  /** Seconds until the lockout lifts. Present only when rate-limited, and used
   *  by the login page to count down and re-enable the form. */
  retryAfterSeconds?: number;
}

export interface ForgotState {
  error?: string;
  /** The neutral acknowledgement. Identical whether or not the address exists. */
  message?: string;
}

export interface ResetPasswordState {
  error?: string;
  /** Shown once on success — the replacement recovery codes. */
  recoveryCodes?: string[];
}

export interface EventFormState {
  error?: string;
}

export interface InviteCreateState {
  error?: string;
  /** The generated accept-invite URL, shown once so the inviter can share it. */
  inviteUrl?: string;
}

export interface AcceptInviteState {
  error?: string;
  /** Shown once on success — the admin's single-use TOTP recovery codes. */
  recoveryCodes?: string[];
}

export interface SetupTotpState {
  error?: string;
  /** Shown once on success — new single-use recovery codes for the second factor. */
  recoveryCodes?: string[];
}

export interface AnnouncementFormState {
  error?: string;
}

export interface ResourceFormState {
  error?: string;
}

export interface ClubFormState {
  error?: string;
}

export interface ContactHandledState {
  error?: string;
}

export interface GalleryFormState {
  error?: string;
}

export interface AchievementFormState {
  error?: string;
}

export interface MemberFormState {
  error?: string;
}

export interface SessionFormState {
  error?: string;
}

export interface MemberInviteState {
  error?: string;
  /** The generated accept-invite URL, shown once so the head can share it. */
  inviteUrl?: string;
}

export interface MemberSetupState {
  error?: string;
}

export interface MemberLoginState {
  error?: string;
}

export interface BroadcastState {
  error?: string;
  /** How many addresses the send actually reached, shown once on success. */
  sent?: number;
}
