import { getCloudflareContext } from "@opennextjs/cloudflare";
import { renderContactCustomerEmail, renderContactSupportEmail } from "@vamos/emails";
import { asAnon } from "@/lib/db/identity";
import { deliverContactMessages, type ContactDeliveryMessage } from "@/lib/forms/contact-delivery";
import { contactSchema } from "@/lib/forms/schemas";
import { formFailure, formSuccess, sendContactMessage } from "@/lib/forms/notify";
import { verifyTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

type ClaimRow = { claim_state?: string };
type SubmitRow = { id?: string };

export async function POST(request: Request) {
  const { env } = getCloudflareContext();
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return formFailure("invalid_input", 400);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return formFailure("invalid_input", 400);

  // Only these untrusted raw fields are extracted before challenge verification.
  const body = raw as Record<string, unknown>;
  const token = typeof body.turnstileToken === "string" ? body.turnstileToken : "";
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";
  const challenge = await verifyTurnstile(
    env.TURNSTILE_SECRET_KEY ?? process.env.TURNSTILE_SECRET_KEY,
    token,
    { action: "contact", idempotencyKey, remoteip: request.headers.get("cf-connecting-ip") ?? undefined },
  );
  if (!challenge.ok) return formFailure("challenge_failed", 403);

  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) return formFailure("invalid_input", 400);
  const input = parsed.data;

  let submissionId: string;
  try {
    const rows = await asAnon(env, (tx) => tx`
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

  const bindings = env as unknown as Record<string, string | undefined>;
  const from = bindings.CONTACT_EMAIL_FROM ?? process.env.CONTACT_EMAIL_FROM;
  const supportRecipient = bindings.CONTACT_SUPPORT_RECIPIENT ?? process.env.CONTACT_SUPPORT_RECIPIENT;
  const apiKey = bindings.RESEND_API_KEY ?? process.env.RESEND_API_KEY;
  const rendered = {
    customer: renderContactCustomerEmail(input.locale, { name: input.name }),
    support: renderContactSupportEmail(input.locale, input),
  } satisfies Record<ContactDeliveryMessage, { subject: string; html: string; text: string }>;

  const delivery = await deliverContactMessages({
    claim: async (message) => {
      try {
        const rows = await asAnon(env, (tx) => tx`select * from public.claim_contact_delivery(${submissionId}, ${message})`);
        const state = (rows[0] as ClaimRow | undefined)?.claim_state;
        return state === "claimed" || state === "accepted" ? state : "unavailable";
      } catch {
        return "unavailable";
      }
    },
    send: (message) => sendContactMessage(
      apiKey,
      from,
      message === "customer" ? input.email : supportRecipient,
      `contact:${submissionId}:${message}:v1`,
      rendered[message],
    ),
    finalize: async (message, providerSuffix) => {
      try {
        const rows = await asAnon(env, (tx) => tx`select public.finalize_contact_delivery(${submissionId}, ${message}, true, ${providerSuffix ?? ""}) as state`);
        return (rows[0] as { state?: string } | undefined)?.state === "accepted" ? "accepted" : "unavailable";
      } catch {
        return "unavailable";
      }
    },
    fail: async (message) => {
      try {
        await asAnon(env, (tx) => tx`select public.finalize_contact_delivery(${submissionId}, ${message}, false, null)`);
      } catch {
        // The route remains fail-closed; no details are logged from a contact request.
      }
    },
  });

  return delivery.accepted ? formSuccess() : formFailure("unavailable", 503);
}
