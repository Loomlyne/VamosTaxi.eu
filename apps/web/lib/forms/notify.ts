import { Resend } from "resend";

export type FormFailureCode = "challenge_failed" | "invalid_input" | "unavailable" | "rate_limited";

const CONTACT_FROM = "Vamos Taxi <noreply@vamostaxi.site>";
const CONTACT_FROM_CF = { email: "noreply@vamostaxi.site", name: "Vamos Taxi" } as const;

export type SendContactOptions = {
  replyTo?: string;
  headers?: Record<string, string>;
};

export function formFailure(code: FormFailureCode, status: 400 | 403 | 503 | 429): Response {
  return Response.json({ ok: false, code }, { status });
}

export function formSuccess(): Response {
  return Response.json({ ok: true });
}

function suffixOf(id: string | null): string | null {
  return id && id.length > 0 ? id.slice(-12) : null;
}

export async function sendContactMessage(
  apiKey: string | undefined,
  from: string | undefined,
  to: string | undefined,
  idempotencyKey: string,
  rendered: { subject: string; html: string; text: string },
  email?: CloudflareEnv["EMAIL"],
  options?: SendContactOptions,
): Promise<{ accepted: boolean; providerSuffix: string | null; providerId: string | null }> {
  void from;
  if (!to) return { accepted: false, providerSuffix: null, providerId: null };
  const payload = {
    from: CONTACT_FROM,
    to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    ...(options?.replyTo ? { replyTo: options.replyTo } : {}),
    ...(options?.headers ? { headers: options.headers } : {}),
  };
  if (apiKey) {
    try {
      const result = await new Resend(apiKey).emails.send(payload, { idempotencyKey });
      const id = result.data?.id;
      if (typeof id === "string" && id.length > 0) {
        return { accepted: true, providerSuffix: suffixOf(id), providerId: id };
      }
    } catch {
      // Fall through to Cloudflare Email when bound.
    }
  }
  if (email?.send) {
    try {
      const result = await email.send({
        to,
        from: CONTACT_FROM_CF,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });
      const id = result?.messageId;
      return typeof id === "string" && id.length > 0
        ? { accepted: true, providerSuffix: suffixOf(id), providerId: id }
        : { accepted: true, providerSuffix: null, providerId: null };
    } catch {
      return { accepted: false, providerSuffix: null, providerId: null };
    }
  }
  return { accepted: false, providerSuffix: null, providerId: null };
}
