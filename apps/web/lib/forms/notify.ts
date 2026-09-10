import { Resend } from "resend";
export type FormFailureCode = "challenge_failed" | "invalid_input" | "unavailable";

const CONTACT_FROM = { email: "noreply@vamostaxi.site", name: "Vamos Taxi" } as const;
const RESEND_FROM = `${CONTACT_FROM.name} <${CONTACT_FROM.email}>`;

export function formFailure(code: FormFailureCode, status: 400 | 403 | 503): Response {
  return Response.json({ ok: false, code }, { status });
}

export function formSuccess(): Response {
  return Response.json({ ok: true });
}

export type SendContactResult = {
  accepted: boolean;
  providerSuffix: string | null;
  providerId: string | null;
};

const REJECTED: SendContactResult = { accepted: false, providerSuffix: null, providerId: null };

export async function sendContactMessage(
  apiKey: string | undefined,
  _from: string | undefined,
  to: string | undefined,
  idempotencyKey: string,
  rendered: { subject: string; html: string; text: string },
  email?: CloudflareEnv["EMAIL"],
): Promise<SendContactResult> {
  if (!to) return REJECTED;

  if (apiKey) {
    try {
      const result = await new Resend(apiKey).emails.send(
        { from: RESEND_FROM, to, subject: rendered.subject, html: rendered.html, text: rendered.text },
        { idempotencyKey },
      );
      const id = result.data?.id;
      if (!result.error && typeof id === "string" && id.length > 0) {
        return { accepted: true, providerSuffix: id.slice(-12), providerId: id };
      }
    } catch {
      // Fall through to Cloudflare Email.
    }
  }

  if (email?.send) {
    try {
      const result = await email.send({
        to,
        from: CONTACT_FROM,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });
      const id = result?.messageId;
      return typeof id === "string" && id.length > 0
        ? { accepted: true, providerSuffix: id.slice(-12), providerId: id }
        : { accepted: true, providerSuffix: null, providerId: null };
    } catch {
      return REJECTED;
    }
  }

  return REJECTED;
}
