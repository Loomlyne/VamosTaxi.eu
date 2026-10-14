// apps/web/lib/checkout/refund-mail.ts
//
// Phase 31 (S-03, D-10, D-11, D-13): when Stripe records a refund, the customer hears it from Vamos in the
// booking's language with the amount of that Stripe refund. Claim first, never throws, the sweep retries a
// failed send.
//
// - The claim is written first through notification_claim_refund (kind 'refund', dedupe
//   'booking:refund:<re_id>'): a second claim of the same refund answers NULL and sends nothing.
// - The booking is read through the definer checkout_booking_for_email (vamos_system has EXECUTE on RPCs
//   only); recipients come only from there (contact plus a different payer), never from Stripe metadata.
// - The amount is the Stripe refund's own rappen, passed in by the caller or read back from the recorded
//   booking_refunds row (notification_refund_read). No arithmetic here (D-11). No is_test filter (D-13).
// - Resend idempotency key 'refund-mail:<re_id>' (and ':payer') is the second guard after the claim.
// - A failed claim (it throws, or no row came back) alerts info@ with the reference and refund id only.
// - Log fields carry ids and stage only: never an address, a name or an amount.

export const dynamic = "force-dynamic";

import { refundMailRecipients, sendRefund, type EmailLocale, type SendOutcome } from "@vamos/emails/confirmation";
import { asSystem } from "../db/identity";
import { withRequestContext } from "../logger";
import { emailLocale } from "../ops/must-fix-mail";
import { alertRefundMailNotSent } from "./refund-mail-alert";

/**
 * Template version written on the claim. The date is the owner's signature of the copy (S-06, 2026-10-13);
 * bump the trailing serial when the rendered content changes. Must match the claim's version regex.
 */
export const REFUND_MAIL_TEMPLATE_VERSION = "refund@2026-10-13-1";

/** One Stripe refund to tell the customer about. `refundRappen` is that refund's own amount (CHF rappen). */
export type RefundMailInput = { bookingId: string; stripeRefundId: string; refundRappen: number };

/** What the mail needs from checkout_booking_for_email. */
export type RefundMailBooking = {
  reference: string;
  locale: string | null;
  contactName: string;
  contactEmail: string;
  payerEmail: string | null;
};

/** One send to one recipient. */
export type RefundMailSend = {
  locale: EmailLocale;
  to: string;
  name: string;
  reference: string;
  amountRappen: number;
  idempotencyKey: string;
};

type LogLevel = "debug" | "info" | "warn" | "error";
type LogValue = string | number | boolean | null;

/** Injected I/O for {@link mailCustomerRefundWithDeps}; {@link refundMailDeps} binds the real ones. */
export type RefundMailDeps = {
  /**
   * notification_claim_refund: the claim id, NULL when this refund is already claimed (the normal replay),
   * undefined when no row came back. Throws on a refusal (e.g. P0002 refund_not_recorded).
   */
  claim: (bookingId: string, stripeRefundId: string) => Promise<number | null | undefined>;
  /** notification_refund_read: an unsent refund claim, or null. */
  readClaim: (
    claimId: number,
  ) => Promise<{ bookingId: string; stripeRefundId: string; refundRappen: number } | null>;
  readBooking: (bookingId: string) => Promise<RefundMailBooking | null>;
  send: (input: RefundMailSend) => Promise<SendOutcome>;
  /** notification_settle: providerMessageId on success, a short error code on failure. */
  settle: (claimId: number, providerMessageId: string | null, error: string | null) => Promise<void>;
  /** info@ alert when the claim failed. Answers whether it went; may throw (caught here). */
  alert: (input: { reference: string | null; stripeRefundId: string }) => Promise<boolean>;
  emit: (level: LogLevel, type: string, fields?: Record<string, LogValue>) => void;
};

const LOG_TYPE = "customer_refund_mail";

function isClaimId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** A fixed, short code for the claim's error column. Provider text never reaches the database or the logs. */
function sendErrorCode(error: string): string {
  if (error === "missing-copy") return "missing_copy";
  if (error === "RESEND_API_KEY is not bound") return "no_api_key";
  if (error === "no refund recipient") return "no_recipient";
  return "send_failed";
}

async function safeSettle(
  deps: RefundMailDeps,
  ids: Record<string, LogValue>,
  claimId: number,
  providerMessageId: string | null,
  error: string | null,
): Promise<void> {
  try {
    await deps.settle(claimId, providerMessageId, error);
  } catch {
    deps.emit("error", LOG_TYPE, { ...ids, stage: "settle" });
  }
}

/** Read, send to every recipient, settle. Never throws; every failure is recorded on the claim. */
async function sendForClaim(
  deps: RefundMailDeps,
  claimId: number,
  refund: { bookingId: string; stripeRefundId: string; refundRappen: number },
): Promise<void> {
  const ids = { bookingId: refund.bookingId, refundId: refund.stripeRefundId, claimId };

  let booking: RefundMailBooking | null;
  try {
    booking = await deps.readBooking(refund.bookingId);
  } catch {
    deps.emit("error", LOG_TYPE, { ...ids, stage: "read" });
    await safeSettle(deps, ids, claimId, null, "read_failed");
    return;
  }

  const recipients = booking ? refundMailRecipients(booking.contactEmail, booking.payerEmail) : [];
  if (!booking || recipients.length === 0) {
    deps.emit("warn", LOG_TYPE, { ...ids, stage: "no_recipient" });
    await safeSettle(deps, ids, claimId, null, "no_recipient");
    return;
  }

  const locale = emailLocale(booking.locale);
  let firstMessageId: string | null = null;
  let error: string | null = null;
  for (const [index, to] of recipients.entries()) {
    const idempotencyKey =
      index === 0 ? `refund-mail:${refund.stripeRefundId}` : `refund-mail:${refund.stripeRefundId}:payer`;
    try {
      const outcome = await deps.send({
        locale,
        to,
        name: booking.contactName,
        reference: booking.reference,
        amountRappen: refund.refundRappen,
        idempotencyKey,
      });
      if (outcome.ok) {
        firstMessageId ??= outcome.providerMessageId;
      } else {
        error ??= sendErrorCode(outcome.error);
      }
    } catch {
      error ??= "send_threw";
    }
  }

  if (error !== null) {
    // A recipient that did get the mail is guarded by its idempotency key when the sweep retries.
    deps.emit("error", LOG_TYPE, { ...ids, stage: "send" });
    await safeSettle(deps, ids, claimId, null, error);
    return;
  }
  await safeSettle(deps, ids, claimId, firstMessageId, null);
}

/** The claim failed: tell info@ with the reference (best effort) and the refund id. Never throws. */
async function alertLostMail(deps: RefundMailDeps, bookingId: string, stripeRefundId: string): Promise<void> {
  let reference: string | null = null;
  try {
    reference = (await deps.readBooking(bookingId))?.reference ?? null;
  } catch {
    reference = null;
  }
  try {
    const sent = await deps.alert({ reference, stripeRefundId });
    if (!sent) deps.emit("error", LOG_TYPE, { bookingId, refundId: stripeRefundId, stage: "alert" });
  } catch {
    deps.emit("error", LOG_TYPE, { bookingId, refundId: stripeRefundId, stage: "alert" });
  }
}

/**
 * Claim, read, send, settle for one Stripe refund. Never throws. A NULL claim is the normal replay and sends
 * nothing; a claim that throws or answers no row alerts info@; a failed send is recorded on the claim for the
 * sweep ({@link deliverRefundMailByClaimWithDeps}).
 */
export async function mailCustomerRefundWithDeps(deps: RefundMailDeps, input: RefundMailInput): Promise<void> {
  const { bookingId, stripeRefundId } = input;
  let claimed: number | null | undefined;
  try {
    claimed = await deps.claim(bookingId, stripeRefundId);
  } catch {
    deps.emit("error", LOG_TYPE, { bookingId, refundId: stripeRefundId, stage: "claim" });
    await alertLostMail(deps, bookingId, stripeRefundId);
    return;
  }
  if (claimed === null) return;
  if (!isClaimId(claimed)) {
    deps.emit("error", LOG_TYPE, { bookingId, refundId: stripeRefundId, stage: "claim_empty" });
    await alertLostMail(deps, bookingId, stripeRefundId);
    return;
  }
  await sendForClaim(deps, claimed, input);
}

/**
 * The sweep path: re-send an existing refund claim by id, with the claim's own Stripe refund id and the
 * recorded refund_rappen. Never claims again and never throws.
 */
export async function deliverRefundMailByClaimWithDeps(deps: RefundMailDeps, claimId: number): Promise<void> {
  let claim: Awaited<ReturnType<RefundMailDeps["readClaim"]>>;
  try {
    claim = await deps.readClaim(claimId);
  } catch {
    deps.emit("error", LOG_TYPE, { claimId, stage: "read_claim" });
    return;
  }
  if (!claim) return;
  await sendForClaim(deps, claimId, claim);
}

type BookingRow = {
  reference?: unknown;
  locale?: unknown;
  contact_name?: unknown;
  contact_email?: unknown;
  payer_email?: unknown;
};

type ClaimRow = { booking_id?: unknown; stripe_refund_id?: unknown; refund_rappen?: unknown };

/** Binds the real I/O. SQL refusals propagate out of asSystem and are caught by the *WithDeps functions. */
export function refundMailDeps(env: CloudflareEnv): RefundMailDeps {
  const emit = withRequestContext({
    requestId: crypto.randomUUID(),
    route: "mail:refund",
    locale: null,
  });
  const key = env.RESEND_API_KEY ?? "";
  return {
    claim: (bookingId, stripeRefundId) =>
      asSystem(env, async (sql) => {
        const rows = await sql`
          select public.notification_claim_refund(
            ${bookingId}::uuid,
            ${stripeRefundId}::text,
            ${REFUND_MAIL_TEMPLATE_VERSION}::text
          ) as id
        `;
        if (rows.length === 0) return undefined;
        const id = (rows[0] as { id?: unknown }).id;
        return id == null ? null : Number(id);
      }),
    readClaim: (claimId) =>
      asSystem(env, async (sql) => {
        const rows = await sql`
          select booking_id, stripe_refund_id, refund_rappen
            from public.notification_refund_read(${claimId}::bigint)
        `;
        const row = rows[0] as ClaimRow | undefined;
        if (!row || row.booking_id == null || row.stripe_refund_id == null) return null;
        return {
          bookingId: String(row.booking_id),
          stripeRefundId: String(row.stripe_refund_id),
          refundRappen: Number(row.refund_rappen),
        };
      }),
    readBooking: (bookingId) =>
      asSystem(env, async (sql) => {
        const rows = await sql`
          select reference, locale, contact_name, contact_email, payer_email
            from public.checkout_booking_for_email(${bookingId}::uuid)
        `;
        const row = rows[0] as BookingRow | undefined;
        if (!row) return null;
        return {
          reference: String(row.reference ?? ""),
          locale: row.locale == null ? null : String(row.locale),
          contactName: String(row.contact_name ?? ""),
          contactEmail: String(row.contact_email ?? ""),
          payerEmail: row.payer_email == null ? null : String(row.payer_email),
        };
      }),
    send: (input) =>
      sendRefund(
        { RESEND_API_KEY: key },
        {
          locale: input.locale,
          kind: "issued",
          to: input.to,
          name: input.name,
          reference: input.reference,
          amountRappen: input.amountRappen,
          idempotencyKey: input.idempotencyKey,
        },
      ),
    settle: async (claimId, providerMessageId, error) => {
      await asSystem(env, async (sql) => {
        await sql`
          select public.notification_settle(
            ${claimId}::bigint,
            ${providerMessageId}::text,
            ${error}::text
          )
        `;
      });
    },
    alert: (input) => alertRefundMailNotSent(env, input),
    emit,
  };
}

/** Env wrapper for the webhook (plan 31-05). Never throws. */
export async function mailCustomerRefund(env: CloudflareEnv, input: RefundMailInput): Promise<void> {
  try {
    await mailCustomerRefundWithDeps(refundMailDeps(env), input);
  } catch {
    // Unreachable by construction (the *WithDeps function catches everything); a guard for the webhook answer.
  }
}

/** Env wrapper for the retry sweep (plan 31-05). Never throws. */
export async function deliverRefundMailByClaim(env: CloudflareEnv, claimId: number): Promise<void> {
  try {
    await deliverRefundMailByClaimWithDeps(refundMailDeps(env), claimId);
  } catch {
    // Unreachable by construction; see mailCustomerRefund.
  }
}
