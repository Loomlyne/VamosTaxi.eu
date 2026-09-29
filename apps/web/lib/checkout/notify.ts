// apps/web/lib/checkout/notify.ts
//
// D-19: the ledger half `@vamos/emails` omits. Claim, send, settle. This
// file never confirms a booking.
//
// 26.3-01 (D-39, VT-26-0737 root cause 2): the claim is written FIRST, every
// read goes through the definer RPC checkout_booking_for_email (vamos_system
// has EXECUTE on RPCs only, never a table SELECT), and nothing after the claim
// can throw to the caller. A failed read or send is recorded on the claim, and
// the hourly sweep resends it.

export const dynamic = "force-dynamic";

import {
  CONFIRMATION_TEMPLATE_VERSION,
  sendConfirmation,
  type BookingForEmail,
  type EmailLocale,
  type SendOutcome,
} from "@vamos/emails/confirmation";
import { asSystem } from "../db/identity";
import { withRequestContext } from "../logger";
import { SUPPORT_EMAIL } from "../contact-channels";
import { extrasFromPolicy } from "./pay-link";
import { mintManageToken } from "./manage-token";

type SettledBooking = {
  booking_id: string;
  reference: string;
  locale: string;
  contact_email: string;
};

/** One row of public.checkout_booking_for_email (v2, 20260930100000). */
export type ConfirmationMailRow = Record<string, unknown>;

type LogLevel = "debug" | "info" | "warn" | "error";
type LogValue = string | number | boolean | null;

/** Injected I/O for {@link deliverConfirmationWithDeps}; the env wrapper binds the real ones. */
export type ConfirmationDeps = {
  /** RESEND_API_KEY; absent means no mail can go out, so nothing is claimed. */
  apiKey: string | undefined;
  /** notification_claim(kind 'confirmation', channel 'email'); null when already claimed. */
  claim: (bookingId: string, locale: EmailLocale) => Promise<number | null>;
  /** checkout_issue_manage_token + checkout_booking_for_email in one asSystem call. */
  load: (
    bookingId: string,
    tokenHash: Uint8Array,
    expires: Date,
  ) => Promise<ConfirmationMailRow | null>;
  mintToken: () => Promise<{ raw: string; hash: Uint8Array }>;
  send: (payload: BookingForEmail) => Promise<SendOutcome>;
  /** notification_settle: providerMessageId on success, error on failure. */
  settle: (claimId: number, providerMessageId: string | null, error: string | null) => Promise<void>;
  emit: (level: LogLevel, type: string, fields?: Record<string, LogValue>) => void;
};

/**
 * Stripe's webhook retries and the Queue backoff both resolve a transient
 * failure well inside this window. A shorter threshold races a delivery still
 * in flight and produces the double-send the ledger exists to prevent.
 * The research's illustrative "e.g. 5 minutes" is not a locked number.
 */
export const SWEEP_THRESHOLD = 10 * 60 * 1000;

const MANAGE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const PUBLIC_ORIGIN = "https://vamostaxi.site";
const ERROR_MAX = 200;

function asEmailLocale(locale: string): EmailLocale {
  if (locale === "de" || locale === "fr" || locale === "ar") return locale;
  return "en";
}

function failureText(err: unknown, fallback: string): string {
  const text = err instanceof Error ? err.message : typeof err === "string" ? err : fallback;
  return (text || fallback).slice(0, ERROR_MAX);
}

function payloadFromRow(
  row: ConfirmationMailRow,
  settled: SettledBooking,
  locale: EmailLocale,
  manageUrl: string,
): BookingForEmail {
  const scheduledLocal = String(row.scheduled_local ?? "");
  // Plan 26.3-08 replaces this mapping with the full breakdown (lines, VAT,
  // coupon, presentment). Extras keep the extrasFromPolicy shape for now.
  const extras = extrasFromPolicy({ extras: row.policy_extras ?? null });
  return {
    reference: String(row.reference ?? settled.reference),
    contactName: String(row.contact_name ?? ""),
    contactEmail: String(row.contact_email ?? settled.contact_email),
    locale,
    displayCurrency: "CHF",
    totalRappen: row.price_total_rappen == null ? null : Number(row.price_total_rappen),
    manageUrl,
    extras,
    legs: [
      {
        legSeq: 1,
        direction: "outbound",
        pickupText: String(row.pickup_text ?? ""),
        dropoffText: String(row.dropoff_text ?? ""),
        scheduledLocal,
        scheduledAt: scheduledLocal,
        flightNo: row.flight_no ? String(row.flight_no) : null,
        vehicleClassLabel: String(row.vehicle_class_slug ?? "business"),
        pax: Number(row.pax ?? 1),
        bags: Number(row.bags ?? 0),
        estimatedDurationMinutes: null,
      },
    ],
  };
}

/**
 * Claim, read, send, settle. Never throws: every failure after the claim is
 * written to the claim (so notification_sweep retries it) and logged with the
 * booking id and stage only — never an address or a name.
 *
 * `opts.claimId` resumes an existing claim (the sweep path) instead of claiming.
 */
export async function deliverConfirmationWithDeps(
  deps: ConfirmationDeps,
  settled: SettledBooking,
  opts: { claimId?: number } = {},
): Promise<void> {
  const bookingId = settled.booking_id;
  const locale = asEmailLocale(settled.locale);
  if (!deps.apiKey) return;

  let claimId: number | null = opts.claimId ?? null;
  let stage = "claim";
  try {
    if (claimId == null) {
      claimId = await deps.claim(bookingId, locale);
      if (claimId == null) return;
    }

    stage = "load";
    const { raw, hash } = await deps.mintToken();
    const expires = new Date(Date.now() + MANAGE_MAX_AGE_MS);
    const row = await deps.load(bookingId, hash, expires);
    if (!row) throw new Error("booking_not_found");

    stage = "send";
    const manageUrl = `${PUBLIC_ORIGIN}/${locale}/manage-booking?token=${raw}`;
    const payload = payloadFromRow(row, settled, locale, manageUrl);
    const outcome = await deps.send(payload);

    // Payer and support copies. A failed copy never fails the customer's mail.
    const extra = new Set<string>();
    const contact = payload.contactEmail.toLowerCase();
    const payer = String(row.payer_email ?? "").trim().toLowerCase();
    if (payer && payer !== contact) extra.add(payer);
    extra.add(SUPPORT_EMAIL.toLowerCase());
    extra.delete(contact);
    for (const to of extra) {
      try {
        const copy = await deps.send({ ...payload, contactEmail: to });
        if (!copy.ok) deps.emit("warn", "confirmation_mail", { bookingId, stage: "copy" });
      } catch {
        deps.emit("warn", "confirmation_mail", { bookingId, stage: "copy" });
      }
    }

    stage = "settle";
    if (outcome.ok) {
      await deps.settle(claimId, outcome.providerMessageId, null);
    } else {
      deps.emit("error", "confirmation_mail", { bookingId, stage: "send" });
      await deps.settle(claimId, null, failureText(outcome.error, "send_failed"));
    }
  } catch (err) {
    deps.emit("error", "confirmation_mail", { bookingId, stage });
    if (claimId == null || stage === "settle") return;
    try {
      await deps.settle(claimId, null, failureText(err, `${stage}_failed`));
    } catch {
      deps.emit("error", "confirmation_mail", { bookingId, stage: "settle" });
    }
  }
}

function confirmationDeps(env: CloudflareEnv): ConfirmationDeps {
  const emit = withRequestContext({
    requestId: crypto.randomUUID(),
    route: "mail:confirmation",
    locale: null,
  });
  const key = env.RESEND_API_KEY;
  return {
    apiKey: key,
    claim: (bookingId, locale) =>
      asSystem(env, async (sql) => {
        const rows = await sql`
          select public.notification_claim(
            ${bookingId}::uuid,
            ${"confirmation"},
            ${null}::uuid,
            ${"email"},
            ${locale},
            ${CONFIRMATION_TEMPLATE_VERSION}
          ) as id
        `;
        const id = rows[0]?.id;
        return id == null ? null : Number(id);
      }),
    load: (bookingId, tokenHash, expires) =>
      asSystem(env, async (sql) => {
        await sql`
          select public.checkout_issue_manage_token(
            ${bookingId}::uuid,
            ${tokenHash},
            ${expires.toISOString()}::timestamptz
          )
        `;
        const rows = await sql`
          select * from public.checkout_booking_for_email(${bookingId}::uuid)
        `;
        return (rows[0] as ConfirmationMailRow | undefined) ?? null;
      }),
    mintToken: mintManageToken,
    send: (payload) => sendConfirmation({ RESEND_API_KEY: key ?? "" }, payload),
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
    emit,
  };
}

export async function deliverConfirmation(
  env: CloudflareEnv,
  settled: SettledBooking,
): Promise<void> {
  await deliverConfirmationWithDeps(confirmationDeps(env), settled);
}

type SweepRow = { id?: unknown; booking_id: unknown; locale?: unknown };

/** Injected I/O for {@link sweepStuckNotificationsWithDeps}. */
export type SweepDeps = {
  /** notification_sweep(interval, kinds): claimed-but-unsent and retryable failed rows. */
  stuck: (interval: string, kinds: string[]) => Promise<SweepRow[]>;
  /** notification_confirmation_missing(interval): paid bookings with no claim. */
  missing: (interval: string) => Promise<SweepRow[]>;
  deliver: (settled: SettledBooking, opts: { claimId?: number }) => Promise<void>;
  emit: ConfirmationDeps["emit"];
};

/**
 * Resends stuck confirmations and sends the ones that were never claimed.
 * One failing booking never stops the rest.
 */
export async function sweepStuckNotificationsWithDeps(
  deps: SweepDeps,
  olderThan = SWEEP_THRESHOLD,
  kinds: string[] = ["confirmation"],
): Promise<void> {
  const interval = `${Math.floor(olderThan / 1000)} seconds`;

  let stuck: SweepRow[] = [];
  try {
    stuck = await deps.stuck(interval, kinds);
  } catch {
    deps.emit("error", "notification_sweep", { stage: "stuck" });
  }
  for (const row of stuck) {
    const bookingId = String(row.booking_id);
    try {
      await deps.deliver(
        { booking_id: bookingId, reference: "", locale: String(row.locale ?? "en"), contact_email: "" },
        { claimId: row.id == null ? undefined : Number(row.id) },
      );
    } catch {
      deps.emit("error", "notification_sweep", { bookingId, stage: "stuck" });
    }
  }

  if (!kinds.includes("confirmation")) return;

  let missing: SweepRow[] = [];
  try {
    missing = await deps.missing(interval);
  } catch {
    deps.emit("error", "notification_sweep", { stage: "missing" });
  }
  for (const row of missing) {
    const bookingId = String(row.booking_id);
    try {
      await deps.deliver(
        { booking_id: bookingId, reference: "", locale: String(row.locale ?? "en"), contact_email: "" },
        {},
      );
    } catch {
      deps.emit("error", "notification_sweep", { bookingId, stage: "missing" });
    }
  }
}

export async function sweepStuckNotifications(
  env: CloudflareEnv,
  olderThan = SWEEP_THRESHOLD,
  kinds: string[] = ["confirmation"],
): Promise<void> {
  const mail = confirmationDeps(env);
  await sweepStuckNotificationsWithDeps(
    {
      stuck: (interval, k) =>
        asSystem(env, async (sql) => {
          const rows = await sql`
            select * from public.notification_sweep(${interval}::interval, ${k}::text[])
          `;
          return rows as unknown as SweepRow[];
        }),
      missing: (interval) =>
        asSystem(env, async (sql) => {
          const rows = await sql`
            select * from public.notification_confirmation_missing(${interval}::interval)
          `;
          return rows as unknown as SweepRow[];
        }),
      deliver: (settled, opts) => deliverConfirmationWithDeps(mail, settled, opts),
      emit: mail.emit,
    },
    olderThan,
    kinds,
  );
}
