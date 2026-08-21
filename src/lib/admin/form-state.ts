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
