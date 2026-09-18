import { z } from "zod";
import { isSafeHttpUrl } from "@/lib/url";
import type { FieldErrors } from "./form-state";

/** Blank becomes null, so the merge falls back to the file's value. */
const blankToNull = (v: string) => (v === "" ? null : v);

const optional = z.string().trim().max(300).transform(blankToNull);

/** Same rule and same wording as the other team admin action (team/actions.ts). */
const Url = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || isSafeHttpUrl(v), {
    message: "Enter a full https:// link, or leave it blank.",
  })
  .transform(blankToNull);

const Focal = z.coerce
  .number()
  .int()
  .min(0, { message: "Must be between 0 and 100." })
  .max(100, { message: "Must be between 0 and 100." });

const Schema = z.object({
  name: z.string().trim().min(1, { message: "Enter a name." }).max(120),
  role: z.string().trim().min(1, { message: "Enter a role." }).max(120),
  // The house wording for a bad address, used across the admin.
  email: z.string().trim().email("That does not look like an email address.").max(120),
  year: optional,
  department: optional,
  description: z.string().trim().max(2000).transform(blankToNull),
  portfolio: Url,
  focalX: Focal,
  focalY: Focal,
});

export type TeamProfileInput = z.infer<typeof Schema>;

/**
 * Parses one person's edit form.
 *
 * Returns every bad field at once, one message each, keyed by the input's
 * `name` — the FieldErrors shape the rest of the admin renders under inputs.
 */
export function validateTeamProfile(fd: FormData): {
  values?: TeamProfileInput;
  fieldErrors?: FieldErrors;
} {
  const parsed = Schema.safeParse({
    name: fd.get("name") ?? "",
    role: fd.get("role") ?? "",
    email: fd.get("email") ?? "",
    year: fd.get("year") ?? "",
    department: fd.get("department") ?? "",
    description: fd.get("description") ?? "",
    portfolio: fd.get("portfolio") ?? "",
    focalX: fd.get("focalX") ?? "50",
    focalY: fd.get("focalY") ?? "50",
  });
  if (parsed.success) return { values: parsed.data };

  const fieldErrors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "");
    // First issue per field wins — an input has room for one message.
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { fieldErrors };
}
