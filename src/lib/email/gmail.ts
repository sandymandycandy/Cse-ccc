import "server-only";
import nodemailer from "nodemailer";
import type { SendArgs, SendResult } from "./resend";

/**
 * Send one email via Gmail SMTP using an app password (the free path — no domain
 * needed). Reads GMAIL_USER + GMAIL_APP_PASSWORD from process.env directly (NOT
 * @/lib/env — see the resend.ts note). The From is always the authenticated Gmail
 * address (Gmail rewrites any other From anyway), with a fixed display name. Never
 * throws; maps failures to { ok: false, error }.
 */
export async function sendViaGmail(args: SendArgs): Promise<SendResult> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return { ok: false, error: "Gmail not configured (GMAIL_USER/GMAIL_APP_PASSWORD)." };

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass: pass.replace(/\s+/g, "") }, // Google shows app passwords with spaces
  });

  try {
    const info = await transporter.sendMail({
      from: `CSE Club Council <${user}>`,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    return { ok: true, id: info.messageId ?? "" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
