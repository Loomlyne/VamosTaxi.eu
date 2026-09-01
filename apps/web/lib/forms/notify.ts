import { Resend } from "resend";
export type FormFailureCode = "challenge_failed" | "invalid_input" | "unavailable";

export function formFailure(code: FormFailureCode, status: 400 | 403 | 503): Response {
  return Response.json({ ok: false, code }, { status });
}

export function formSuccess(): Response {
  return Response.json({ ok: true });
}

export async function sendContactMessage(
  apiKey: string | undefined,
  from: string | undefined,
  to: string | undefined,
  idempotencyKey: string,
  rendered: { subject: string; html: string; text: string },
): Promise<{ accepted: boolean; providerSuffix: string | null }> {
  if (!apiKey || !from || !to) return { accepted: false, providerSuffix: null };
  try {
    const result = await new Resend(apiKey).emails.send(
      { from, to, subject: rendered.subject, html: rendered.html, text: rendered.text },
      { idempotencyKey },
    );
    const id = result.data?.id;
    return typeof id === "string" && id.length > 0
      ? { accepted: true, providerSuffix: id.slice(-12) }
      : { accepted: false, providerSuffix: null };
  } catch {
    return { accepted: false, providerSuffix: null };
  }
}
