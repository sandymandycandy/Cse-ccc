// Shared server-action result shapes. Kept out of the "use server" files
// themselves, which may only export async functions.

export interface LoginState {
  error?: string;
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
