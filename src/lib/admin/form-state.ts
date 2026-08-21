// Shared server-action result shapes. Kept out of the "use server" files
// themselves, which may only export async functions.

export interface LoginState {
  error?: string;
}

export interface EventFormState {
  error?: string;
}
