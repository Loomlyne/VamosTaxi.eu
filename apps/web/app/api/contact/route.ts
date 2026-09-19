import { getCloudflareContext } from "@opennextjs/cloudflare";
import { renderContactCustomerEmail, renderContactSupportEmail } from "@vamos/emails";
import { checkWriteRateLimit } from "@/lib/abuse/rate-limit";
import { asSystem } from "@/lib/db/identity";
import { deliverContactMessages, type ContactDeliveryMessage } from "@/lib/forms/contact-delivery";
import { contactSchema } from "@/lib/forms/schemas";
import { formFailure, formSuccess, sendContactMessage } from "@/lib/forms/notify";
import { contactMessageId, ticketReplyAddress } from "@/lib/ops/ticket-mail";
import { csrfForbidden } from "@/lib/security/origin";
import { verifyTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

type ClaimRow = { claim_state?: string; lease_token?: string };
type SubmitRow = { id?: string };

export async function POST(request: Request) {
  const csrf = csrfForbidden(request);
  if (csrf) return csrf;
  const { env } = getCloudflareContext();
  const bindings = env as unknown as Record<string, string | undefined>;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return formFailure("invalid_input", 400);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return formFailure("invalid_input", 400);

  const ip = request.headers.get("cf-connecting-ip")?.trim() || "unknown";
  const limited = await checkWriteRateLimit({
    limiter: env.QUOTE_RATE_LIMITER,
    kind: "contact",
    ip,
  });
  if (!limited.ok) return formFailure("rate_limited", 429);

  // Only these untrusted raw fields are extracted before challenge verification.
  const body = raw as Record<string, unknown>;
  const token = typeof body.turnstileToken === "string" ? body.turnstileToken : "";
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";
  const challenge = await verifyTurnstile(
    env.TURNSTILE_SECRET_KEY ?? process.env.TURNSTILE_SECRET_KEY,
    token,
    {
      action: "contact",
      idempotencyKey,
      allowedHostnames: bindings.CONTACT_TURNSTILE_ALLOWED_HOSTNAMES ?? process.env.CONTACT_TURNSTILE_ALLOWED_HOSTNAMES,
      remoteip: request.headers.get("cf-connecting-ip") ?? undefined,
    },
  );
  if (!challenge.ok) return formFailure("challenge_failed", 403);

  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) return formFailure("invalid_input", 400);
  const input = parsed.data;

  let submissionId: string;
  try {
    const rows = await asSystem(env, (tx) => tx`
      select * from public.submit_contact_message(
        ${input.idempotencyKey}, ${input.name}, ${input.email}, ${input.phone},
        ${input.bookingRef}, ${input.message}, ${input.locale}
      )
    `);
    submissionId = (rows[0] as SubmitRow | undefined)?.id ?? "";
  } catch {
    return formFailure("unavailable", 503);
  }
  if (!submissionId) return formFailure("unavailable", 503);

  const from = bindings.CONTACT_EMAIL_FROM ?? process.env.CONTACT_EMAIL_FROM;
  const supportRecipient = bindings.CONTACT_SUPPORT_RECIPIENT ?? process.env.CONTACT_SUPPORT_RECIPIENT;
  const apiKey = bindings.RESEND_API_KEY ?? process.env.RESEND_API_KEY;
  let replyTo: string | undefined;
  try {
    const meta = await asSystem(env, (tx) => tx<{ reply_token: string | null }[]>`
      select reply_token from public.contact_submissions where id = ${submissionId}::uuid limit 1
    `);
    const token = String(meta[0]?.reply_token ?? "").trim();
    if (token) replyTo = ticketReplyAddress(token);
  } catch {
    replyTo = undefined;
  }
  const rendered = {
    customer: renderContactCustomerEmail(input.locale, { name: input.name, message: input.message }),
    support: renderContactSupportEmail(input.locale, input),
  } satisfies Record<ContactDeliveryMessage, { subject: string; html: string; text: string }>;

  let customerRfcMessageId: string | null | undefined;
  let customerChannel: "resend" | "email" | null | undefined;
  let customerAccepted: boolean | undefined;

  const delivery = await deliverContactMessages({
    claim: async (message) => {
      try {
        const rows = await asSystem(env, (tx) => tx`select * from public.claim_contact_delivery(${submissionId}, ${message})`);
        const claim = rows[0] as ClaimRow | undefined;
        if (claim?.claim_state === "claimed" && typeof claim.lease_token === "string" && claim.lease_token.length > 0) {
          return { state: "claimed", leaseToken: claim.lease_token };
        }
        return claim?.claim_state === "accepted" ? { state: "accepted" } : { state: "unavailable" };
      } catch {
        return { state: "unavailable" };
      }
    },
    send: async (message, providerIdempotencyKey) => {
      const sent = await sendContactMessage(
        apiKey,
        from,
        message === "customer" ? input.email : supportRecipient,
        providerIdempotencyKey,
        rendered[message],
        env.EMAIL,
        message === "customer" ? { replyTo } : undefined,
      );
      if (message === "customer") {
        customerRfcMessageId = sent.rfcMessageId;
        customerChannel = sent.channel;
        customerAccepted = sent.accepted;
      }
      return { ...sent, channel: sent.channel ?? undefined };
    },
    finalize: async (message, leaseToken, providerSuffix) => {
      try {
        const rows = await asSystem(env, (tx) => tx`select public.finalize_contact_delivery(${submissionId}, ${message}, ${leaseToken}, true, ${providerSuffix ?? ""}) as state`);
        return (rows[0] as { state?: string } | undefined)?.state === "accepted" ? "accepted" : "unavailable";
      } catch {
        return "unavailable";
      }
    },
    fail: async (message, leaseToken) => {
      try {
        await asSystem(env, (tx) => tx`select public.finalize_contact_delivery(${submissionId}, ${message}, ${leaseToken}, false, null)`);
      } catch {
        // The route remains fail-closed; no details are logged from a contact request.
      }
    },
  }, submissionId);

  if (delivery.accepted) {
    try {
      const rfc =
        customerChannel === "resend" && typeof customerRfcMessageId === "string" && /^<.+@.+>$/.test(customerRfcMessageId)
          ? customerRfcMessageId
          : customerChannel === "email"
            ? contactMessageId(submissionId)
            : null;
      if (rfc && customerAccepted) {
        await asSystem(env, (tx) => tx`
          update public.support_messages
          set rfc_message_id = ${rfc}
          where submission_id = ${submissionId}::uuid
            and direction = 'inbound_form'
            and (rfc_message_id is null or rfc_message_id = '')
        `);
      }
    } catch {
      // Ack already went out; missing RFC id only weakens threading.
    }
    return formSuccess();
  }
  return formFailure("unavailable", 503);
}
