import { Resend } from "resend";
import { asRfcMessageId } from "../ops/ticket-mail";

export type FormFailureCode = "challenge_failed" | "invalid_input" | "unavailable" | "rate_limited";

const CONTACT_FROM = "Vamos Taxi <noreply@vamostaxi.site>";
const CONTACT_FROM_CF = { email: "noreply@vamostaxi.site", name: "Vamos Taxi" } as const;
const RFC_MESSAGE_ID = /^<.+@.+>$/;

export type SendContactOptions = {
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  bcc?: string | string[];
  /** Contact ack may use Cloudflare EMAIL. Staff replies must not. */
  allowEmailFallback?: boolean;
};

export type SendContactResult = {
  accepted: boolean;
  providerSuffix: string | null;
  providerId: string | null;
  rfcMessageId: string | null;
  channel: "resend" | "email" | null;
};

const NO_STORE = { "cache-control": "private, no-store" } as const;

export function formFailure(code: FormFailureCode, status: 400 | 403 | 503 | 429): Response {
  return Response.json({ ok: false, code }, { status, headers: NO_STORE });
}

export function formSuccess(): Response {
  return Response.json({ ok: true }, { headers: NO_STORE });
}

function suffixOf(id: string | null): string | null {
  return id && id.length > 0 ? id.slice(-12) : null;
}

function closed(partial?: Partial<SendContactResult>): SendContactResult {
  return {
    accepted: false,
    providerSuffix: null,
    providerId: null,
    rfcMessageId: null,
    channel: null,
    ...partial,
  };
}

/** GET /emails often returns message_id null while last_event is still queued. */
export const RFC_MESSAGE_ID_GET_GAPS_MS = [0, 300, 700, 1500] as const;

export async function retrieveRfcMessageId(apiKey: string, id: string): Promise<string | null> {
  const client = new Resend(apiKey);
  for (const gap of RFC_MESSAGE_ID_GET_GAPS_MS) {
    if (gap > 0) {
      await new Promise((resolve) => setTimeout(resolve, gap));
    }
    try {
      const result = await client.emails.get(id);
      const raw = result.data && "message_id" in result.data ? result.data.message_id : undefined;
      if (result.error || typeof raw !== "string" || raw.length === 0) continue;
      const normalized = asRfcMessageId(raw);
      if (RFC_MESSAGE_ID.test(normalized)) return normalized;
    } catch {
      continue;
    }
  }
  return null;
}

export async function sendContactMessage(
  apiKey: string | undefined,
  from: string | undefined,
  to: string | undefined,
  idempotencyKey: string,
  rendered: { subject: string; html: string; text: string },
  email?: CloudflareEnv["EMAIL"],
  options?: SendContactOptions,
): Promise<SendContactResult> {
  void from;
  if (!to) return closed();
  const allowEmailFallback = options?.allowEmailFallback !== false;
  const payloadFrom = options?.from && options.from.length > 0 ? options.from : CONTACT_FROM;
  const payload = {
    from: payloadFrom,
    to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    ...(options?.replyTo ? { replyTo: options.replyTo } : {}),
    ...(options?.headers ? { headers: options.headers } : {}),
    ...(options?.bcc ? { bcc: options.bcc } : {}),
  };
  if (apiKey) {
    try {
      const result = await new Resend(apiKey).emails.send(payload, { idempotencyKey });
      const id = result.data?.id;
      if (!result.error && typeof id === "string" && id.length > 0) {
        const rfcMessageId = await retrieveRfcMessageId(apiKey, id);
        if (rfcMessageId) {
          return {
            accepted: true,
            providerSuffix: suffixOf(id),
            providerId: id,
            rfcMessageId,
            channel: "resend",
          };
        }
        if (!allowEmailFallback) {
          return closed();
        }
        return {
          accepted: true,
          providerSuffix: suffixOf(id),
          providerId: id,
          rfcMessageId: null,
          channel: "resend",
        };
      }
    } catch {
      // Staff replies fail closed. Contact ack may still use EMAIL.
    }
    if (!allowEmailFallback) {
      return closed();
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
        ? {
            accepted: true,
            providerSuffix: suffixOf(id),
            providerId: id,
            rfcMessageId: null,
            channel: "email",
          }
        : { accepted: true, providerSuffix: null, providerId: null, rfcMessageId: null, channel: "email" };
    } catch {
      return closed();
    }
  }
  return closed();
}
