/**
 * Pure email body renderer (spec §Architecture). A single branded wrapper for every
 * template: greets the recipient, states the subject, and — when the payload carries a
 * known action URL — renders a primary button. Every interpolated value is HTML-escaped.
 * The returned html is used ONLY as a Resend email body, never in the app DOM.
 */

const URL_KEYS = ["inviteUrl", "confirmUrl", "url"] as const;

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** First http(s) URL found under a known payload key, else null. */
function actionUrl(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  for (const k of URL_KEYS) {
    const v = payload[k];
    if (typeof v === "string" && /^https?:\/\//i.test(v)) return v;
  }
  return null;
}

/** A label → value pair rendered above the body, e.g. who a query came from. */
export interface EmailDetail {
  label: string;
  value: string;
}

/** `payload.details` when it is a well-formed list of label/value pairs. */
function details(payload: Record<string, unknown> | null): EmailDetail[] {
  const raw = payload?.details;
  if (!Array.isArray(raw)) return [];
  const out: EmailDetail[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { label, value } = item as Record<string, unknown>;
    if (typeof label !== "string" || !label) continue;
    out.push({ label, value: value == null ? "" : String(value) });
  }
  return out;
}

/** `payload.body` — free text quoted into the mail, e.g. the message someone sent. */
function bodyText(payload: Record<string, unknown> | null): string {
  const v = payload?.body;
  return typeof v === "string" ? v.trim() : "";
}

export interface RenderedEmail {
  html: string;
  text: string;
}

export function renderEmail(
  _template: string,
  subject: string,
  toName: string | null,
  payload: Record<string, unknown> | null,
): RenderedEmail {
  const url = actionUrl(payload);
  const rows = details(payload);
  const body = bodyText(payload);
  const greeting = toName ? `Hi ${esc(toName)},` : "Hi,";

  // Both blocks are escaped and then re-broken on newlines — the message being
  // quoted here is public user input, so it is never trusted as markup.
  const detailHtml = rows.length
    ? `<table cellpadding="0" cellspacing="0" style="margin:0 0 16px;font-size:14px">${rows
        .map(
          (r) =>
            `<tr><td style="padding:3px 14px 3px 0;color:#6b6b6b;white-space:nowrap">${esc(
              r.label,
            )}</td><td style="padding:3px 0;word-break:break-word">${esc(r.value)}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const bodyHtml = body
    ? `<div style="margin:0 0 16px;padding:14px 16px;border-left:3px solid #1f4d3a;background:#f4f6f4;white-space:pre-wrap;word-break:break-word">${esc(
        body,
      )}</div>`
    : "";

  const button = url
    ? `<p style="margin:24px 0"><a href="${esc(url)}" style="display:inline-block;background:#1f4d3a;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font:600 15px sans-serif">Open</a></p>
       <p style="color:#666;font-size:13px;word-break:break-all">Or open this link:<br><a href="${esc(url)}" style="color:#1f4d3a">${esc(url)}</a></p>`
    : "";

  const html = `<div style="max-width:520px;margin:0 auto;font:400 15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a">
  <div style="font:600 12px sans-serif;color:#1f4d3a;letter-spacing:.06em;text-transform:uppercase">CSE Club Council</div>
  <h1 style="font:400 22px Georgia,'Times New Roman',serif;margin:8px 0 16px">${esc(subject)}</h1>
  <p style="margin:0 0 12px">${greeting}</p>
  ${detailHtml}
  ${bodyHtml}
  ${button}
  <hr style="border:none;border-top:1px solid #e6e6e6;margin:28px 0" />
  <p style="color:#9a9a9a;font-size:12px;margin:0">CSE Club Council · automated message, please don't reply.</p>
</div>`;

  const text = [
    subject,
    "",
    toName ? `Hi ${toName},` : "Hi,",
    ...(rows.length ? ["", ...rows.map((r) => `${r.label}: ${r.value}`)] : []),
    ...(body ? ["", body] : []),
    url ? `\nOpen: ${url}` : "",
    "",
    "— CSE Club Council",
  ].join("\n");

  return { html, text };
}
