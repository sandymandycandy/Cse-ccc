import "server-only";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface EmailAttachment {
  filename: string;
  /** Raw file bytes. */
  content: Buffer;
  /** MIME type, e.g. "application/pdf". */
  contentType?: string;
}

export interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
}

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Send one email via the Resend HTTP API (spec §Architecture). Reads
 * RESEND_API_KEY + EMAIL_FROM from process.env directly (NOT @/lib/env — importing
 * that eagerly validates the whole, intentionally-partial env and throws). Never
 * throws on a bad response; maps it to { ok: false, error }.
 */
export async function sendViaResend(args: SendArgs): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return { ok: false, error: "Email not configured (RESEND_API_KEY/EMAIL_FROM)." };

  let res: Response;
  try {
    res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: args.to,
        subject: args.subject,
        html: args.html,
        text: args.text,
        ...(args.attachments?.length
          ? {
              attachments: args.attachments.map((a) => ({
                filename: a.filename,
                content: a.content.toString("base64"),
                ...(a.contentType ? { content_type: a.contentType } : {}),
              })),
            }
          : {}),
      }),
    });
  } catch (e) {
    return { ok: false, error: `Network error: ${(e as Error).message}` };
  }

  if (!res.ok) {
    let msg = `Resend HTTP ${res.status}`;
    try {
      const b = await res.json();
      if (b?.message) msg = String(b.message);
    } catch {
      /* keep the status-code message */
    }
    return { ok: false, error: msg };
  }
  const body = await res.json().catch(() => ({}));
  return { ok: true, id: typeof body?.id === "string" ? body.id : "" };
}
