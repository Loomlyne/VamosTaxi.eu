// Shared owner-notification + JSON envelope for SITE-04 form routes.
// The five-step order (challenge → zod → write → notify) stays in each
// route so verifyTurnstile / safeParse / asAnon remain greppable there.

import { Resend } from "resend";
import { escapeHtml, layoutHtml, layoutText } from "@vamos/emails";
import { log, type RequestContext } from "@/lib/logger";

const FROM = "Vamos Taxi <noreply@vamostaxi.eu>";
const TO = "Vamos Taxi <noreply@vamostaxi.eu>";

export type FormFailureCode = "challenge_failed" | "invalid_input" | "unavailable";

export function formFailure(code: FormFailureCode, status: 400 | 403 | 503): Response {
  return Response.json({ ok: false, code }, { status });
}

export function formSuccess(created: boolean): Response {
  return Response.json({ ok: true, created });
}

export function renderOwnerNotice(
  subject: string,
  lines: string[],
): { subject: string; html: string; text: string } {
  const inner = lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
  return {
    subject,
    html: layoutHtml("en", inner),
    text: layoutText(lines.join("\n")),
  };
}

export async function sendOwnerNotice(
  apiKey: string | undefined,
  rendered: { subject: string; html: string; text: string },
  ctx: RequestContext,
  type: string,
): Promise<void> {
  if (!apiKey) {
    log("info", type, ctx, { subject: rendered.subject, notify: 0 });
    return;
  }
  try {
    await new Resend(apiKey).emails.send({
      from: FROM,
      to: TO,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
  } catch {
    log("error", type, ctx, { notify: 0 });
  }
}
