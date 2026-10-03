"use client";

// D-16: this component performs no write and does not confirm a booking.
// TWINT and 3DS may never return to this tab — the poller is the only
// observer, and it is read-only.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/feedback/Alert";
import { ProgressIndicator } from "@/components/feedback/ProgressIndicator";
import { Button, Card, Icon } from "@/components/core";
import type { IconName } from "@/components/core";
import { PriceSummary, RouteSummary, StatusBadge } from "@/components/transfer";
import type { PriceLine } from "@/components/transfer/PriceSummary";
import { BookingVoucher, type BookingVoucherFacts } from "@/components/booking/BookingVoucher";
import { useBookingDraft } from "@/lib/booking-draft";
import { PHONE_DISPLAY, PHONE_HREF, WHATSAPP_HREF } from "@/lib/contact-channels";
import { isFailedStatus } from "@/lib/checkout/booking-status";
import { confirmationPhase } from "@/lib/checkout/confirmation-phase";
import {
  addMinutesLocal,
  formatTripDate,
  formatTripTime,
  rappenToMajor,
} from "@/lib/checkout/confirmation-receipt";
import type { ReceiptRow } from "@/lib/checkout/confirmation-receipt";
import type { BookingReceipt } from "@/lib/checkout/booking-read";
import { formatAmount } from "@/lib/currency";
import { voucherBadgeStatus, voucherNeedsPayment } from "@/lib/checkout/voucher-badge";

/**
 * Where the server left the page. "processing" is the return path from Stripe
 * (S3 loading screen until the booking is confirmed); the rest are later visits.
 */
export type ConfirmationPhase = "hidden" | "processing" | "confirmed" | "failed";

/**
 * First status GET is immediate so a fast webhook paints the voucher
 * without a two-second blank wait.
 */
export const POLL_INTERVAL_MS = 1000;

/** Loading screen phase A to B switch lives in confirmationPhase (D-27). */

export type ConfirmationFacts = BookingVoucherFacts & {
  reference: string;
  /** 26.3-09: rows, presentment and class name for the S4 money block. */
  receipt?: BookingReceipt;
};

export type ConfirmationClientProps = {
  locale: string;
  reference: string;
  initialPhase: ConfirmationPhase;
  booking: ConfirmationFacts | null;
  freeCancelHours: number | null;
  /** MANAGE BOOKING target, picked by the server from how it read this booking. */
  manageHref?: string;
};

function asStringField(json: object, key: string): string {
  if (!(key in json)) return "";
  const value = (json as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function pollStatus(json: unknown): { status: string; paymentStatus: string } | null {
  if (!json || typeof json !== "object") return null;
  if ("visible" in json && (json as { visible: unknown }).visible === false) return null;
  return { status: asStringField(json, "status"), paymentStatus: asStringField(json, "paymentStatus") };
}

/** One line, two links: the public phone and WhatsApp (approved wording 2026-10-01). */
function HelpLine() {
  const t = useTranslations("checkout");
  return (
    <p className="vt-confirmation__help-line" data-confirmation-help>
      {t.rich("helpLine", {
        phone: PHONE_DISPLAY,
        tel: (chunks) => (
          <a className="vt-confirmation__help-link vt-dir-keep" href={PHONE_HREF}>
            {chunks}
          </a>
        ),
        wa: (chunks) => (
          <a className="vt-confirmation__help-link" href={WHATSAPP_HREF} target="_blank" rel="noopener noreferrer">
            {chunks}
          </a>
        ),
      })}
    </p>
  );
}

const SUPPORT_EMAIL = "info@vamostaxi.site";

function firstName(full: string | undefined): string {
  return (full ?? "").trim().split(/\s+/)[0] ?? "";
}

/** The reference from the URL is the only fact shown until the booking is readable. */
function RefLine({ reference }: { reference: string }) {
  const t = useTranslations("checkout");
  return (
    <p className="vt-confirmation__wait-ref">
      {t("bookingPrefix")}{" "}
      <span className="vt-confirmation__ref vt-dir-keep" data-confirmation-ref>
        {reference}
      </span>
    </p>
  );
}

/**
 * S3: after Stripe returns. Phase A shows a charcoal progress bar; phase B (after
 * ~20 s) says the payment was received. Neither shows an error, failed or retry copy.
 */
function LoadingScreen({
  received,
  reference,
  locale,
}: {
  received: boolean;
  reference: string;
  locale: string;
}) {
  const t = useTranslations("checkout");
  return (
    <main
      className="vt-confirmation"
      data-confirmation
      data-confirmation-state={received ? "received" : "confirming"}
    >
      <Card padding="lg" className="vt-confirmation__wait vt-confirmation__loading">
        <div aria-live="polite" aria-busy={received ? "false" : "true"} className="vt-confirmation__loading-body">
          {received ? (
            <span className="vt-confirmation__disc" aria-hidden="true">
              <Icon name="check" size={28} color="var(--vt-yellow)" />
            </span>
          ) : (
            <ProgressIndicator tone="charcoal" aria-label={t("confirmingTitle")} aria-valuenow={undefined} />
          )}
          <h1 className="vt-confirmation__title">{received ? t("receivedTitle") : t("confirmingTitle")}</h1>
          <p className="vt-confirmation__lede">{received ? t("receivedBody") : t("confirmingBody")}</p>
          <RefLine reference={reference} />
        </div>
        {received ? (
          <>
            <div className="vt-confirmation__actions">
              <Button variant="secondary" href={`/${locale}`}>
                {t("book-another-transfer")}
              </Button>
            </div>
            <p className="vt-confirmation__wait-ref">{t("receivedContact", { email: SUPPORT_EMAIL })}</p>
          </>
        ) : null}
      </Card>
    </main>
  );
}

/** S4 head (2026-10-01): disc and status badge in one row, heading, reference and e-mail line. */
function BookedHero({
  firstName: name,
  reference,
  email,
}: {
  firstName: string;
  reference: string;
  email: string;
}) {
  const t = useTranslations("checkout");
  const refTag = (chunks: ReactNode) => (
    <span className="vt-confirmation__ref vt-dir-keep" data-confirmation-ref>
      {chunks}
    </span>
  );
  return (
    <div className="vt-confirmation__hero vt-confirmation__hero--booked">
      <div className="vt-confirmation__hero-row">
        <span className="vt-confirmation__disc" aria-hidden="true">
          <Icon name="check" size={24} color="var(--vt-yellow)" />
        </span>
        <StatusBadge status="confirmed" label={t("statusBooked")} />
      </div>
      <h1 className="vt-confirmation__title">
        {name ? t("bookedTitle", { firstName: name }) : t("bookedTitleNoName")}
      </h1>
      <p className="vt-confirmation__lede">
        {email
          ? t.rich("bookedLede", {
              reference,
              email,
              ref: refTag,
              mail: (chunks) => <span className="vt-dir-keep">{chunks}</span>,
            })
          : t.rich("bookedLedeNoEmail", { reference, ref: refTag })}
      </p>
    </div>
  );
}

function classNameOf(
  booking: ConfirmationFacts | null,
  tCommon: ReturnType<typeof useTranslations>,
): string {
  const named = booking?.receipt?.vehicleClassName?.trim();
  if (named) return named;
  const slug = (booking?.vehicleClassSlug || "").trim();
  if (slug === "economy") return tCommon("vehicleClassEconomy");
  if (slug === "business") return tCommon("vehicleClassBusiness");
  if (slug === "van") return tCommon("vehicleClassVan");
  return "";
}

function FactRow({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  return (
    <div className="vt-confirmation__fact">
      <dt>
        <Icon name={icon} size={14} />
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Same money rows as the confirmation e-mail: fare, extras, voucher, VAT, total paid. */
function moneyLines(
  rows: ReceiptRow[],
  className: string,
  t: ReturnType<typeof useTranslations>,
): { lines: PriceLine[]; total: number | null } {
  const lines: PriceLine[] = [];
  let total: number | null = null;
  for (const row of rows) {
    const amount = rappenToMajor(row.amountRappen);
    if (row.kind === "total") {
      total = amount;
    } else if (row.kind === "fare") {
      lines.push({ label: className ? t("receiptFare", { class: className }) : t("receiptFarePlain"), amount });
    } else if (row.kind === "extra") {
      lines.push({ label: row.label, amount });
    } else if (row.kind === "coupon") {
      lines.push({
        label: <span data-confirmation-coupon={row.label}>{t("receiptVoucher", { code: row.label })}</span>,
        amount,
        credit: true,
      });
    } else if (row.kind === "vat") {
      const rate = /([0-9]+(?:\.[0-9]+)?)\s*%/.exec(row.label)?.[1];
      lines.push({ label: rate ? t("receiptVat", { rate }) : t("receiptVatPlain"), amount });
    }
  }
  return { lines, total };
}

/** S4 trip card: route, four labelled facts, the e-mail's money rows. */
function BookedCard({
  locale,
  booking,
  fallback,
}: {
  locale: string;
  booking: ConfirmationFacts | null;
  fallback: { pickup: string; dropoff: string; date: string; time: string; passengers: number };
}) {
  const t = useTranslations("checkout");
  const tCommon = useTranslations("common");
  const pickup = (booking?.pickupText || "").trim() || fallback.pickup;
  const dropoff = (booking?.dropoffText || "").trim() || fallback.dropoff;
  const scheduled = booking?.scheduledLocal || "";
  const dateLabel = scheduled ? formatTripDate(scheduled, locale) : fallback.date;
  const timeLabel = scheduled ? formatTripTime(scheduled) : fallback.time;
  const durationMin = booking?.durationMin ?? null;
  const arriveLabel = scheduled && durationMin != null ? addMinutesLocal(scheduled, durationMin) : "";
  const pax = booking && booking.pax > 0 ? booking.pax : fallback.passengers;
  const flightNo = (booking?.flightNo || "").trim();
  const cls = classNameOf(booking, tCommon);
  const receipt = booking?.receipt;
  const { lines, total } = moneyLines(receipt?.rows ?? [], cls, t);
  const totalMajor = total ?? rappenToMajor(booking?.priceTotalRappen ?? null);
  const presentment = receipt?.presentment ?? null;
  let paidIn = "";
  if (presentment) {
    try {
      paidIn = new Intl.NumberFormat(locale, { style: "currency", currency: presentment.currency }).format(
        presentment.amountMinor / 100,
      );
    } catch {
      paidIn = `${presentment.currency} ${(presentment.amountMinor / 100).toFixed(2)}`;
    }
  }
  return (
    <Card padding="lg" className="vt-confirmation__booked" data-confirmation-voucher>
      <RouteSummary
        pickup={pickup}
        dropoff={dropoff}
        pickupDetail={
          timeLabel ? (
            <span className="vt-confirmation__when vt-dir-keep" data-confirmation-pickup-at>
              <Icon name="clock" size={14} />
              {timeLabel}
            </span>
          ) : undefined
        }
        dropoffDetail={
          arriveLabel ? (
            <span className="vt-confirmation__when vt-dir-keep" data-confirmation-arrive>
              <Icon name="clock" size={14} />
              {arriveLabel}
            </span>
          ) : undefined
        }
      />
      <dl className="vt-confirmation__facts" data-confirmation-receipt>
        {dateLabel ? (
          <FactRow icon="calendar" label={t("factWhen")}>
            <span className="vt-dir-keep">{dateLabel}</span>
          </FactRow>
        ) : null}
        {pax > 0 ? (
          <FactRow icon="users" label={t("factTravellers")}>
            {t("passengersCount", { n: pax })}
          </FactRow>
        ) : null}
        {cls ? (
          <FactRow icon="car" label={t("factClass")}>
            {cls}
          </FactRow>
        ) : null}
        {flightNo ? (
          <FactRow icon="plane" label={tCommon("flight-number")}>
            <span className="vt-dir-keep">{flightNo}</span>
          </FactRow>
        ) : null}
      </dl>
      <PriceSummary lines={lines} total={totalMajor} totalLabel={t("receiptTotalPaid")} />
      {presentment ? (
        <p className="vt-confirmation__presentment" data-confirmation-presentment>
          {t.rich("receiptPresentment", {
            paid: paidIn,
            currency: presentment.currency,
            received: formatAmount(rappenToMajor(receipt?.chargedRappen ?? null)),
            fig: (chunks) => <span className="vt-dir-keep">{chunks}</span>,
          })}
        </p>
      ) : null}
    </Card>
  );
}

/**
 * "What happens next" (approved wording 2026-10-01): the two e-mails the site really
 * sends (assignmentCustomer, reminder24h) and the free-cancel window from settings.
 * When settings cannot be read the hours are a labelled data-tok gap, never a guess.
 */
function NextSteps({ freeCancelHours }: { freeCancelHours: number | null }) {
  const t = useTranslations("checkout");
  const hoursKnown = freeCancelHours != null;
  const steps: { icon: IconName; key: string; title: ReactNode; body: string }[] = [
    { icon: "user", key: "assign", title: t("nextAssignTitle"), body: t("nextAssignBody") },
    { icon: "bell", key: "reminder", title: t("nextReminderTitle"), body: t("nextReminderBody") },
    {
      icon: "shield-check",
      key: "cancel",
      title: t.rich("nextCancelTitle", {
        hours: hoursKnown ? String(freeCancelHours) : "free cancel window",
        h: (chunks) =>
          hoursKnown ? (
            <span className="vt-dir-keep" data-confirmation-cancel-hours>
              {chunks}
            </span>
          ) : (
            <span data-tok>{chunks}</span>
          ),
      }),
      body: t("nextCancelBody"),
    },
  ];
  return (
    <Card padding="lg" className="vt-confirmation__next" data-confirmation-next>
      <h2 className="vt-confirmation__next-title">{t("whatHappensNext")}</h2>
      <ol className="vt-confirmation__next-list">
        {steps.map((step) => (
          <li key={step.key} className="vt-confirmation__next-step" data-confirmation-step={step.key}>
            <span className="vt-confirmation__next-disc" aria-hidden="true">
              <Icon name={step.icon} size={16} color="var(--vt-yellow)" />
            </span>
            <span className="vt-confirmation__next-copy">
              <span className="vt-confirmation__next-head">{step.title}</span>
              <span className="vt-confirmation__next-body">{step.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/**
 * The page's only two buttons (signed 2026-10-01): MANAGE BOOKING and DOWNLOAD
 * VOUCHER. An unpaid booking shows FINISH PAYMENT alone: Manage booking refuses an
 * unpaid booking and there is no voucher before payment.
 */
function ActionRow({
  locale,
  manageHref,
  unpaid,
}: {
  locale: string;
  manageHref: string;
  unpaid: boolean;
}) {
  const t = useTranslations("checkout");
  if (unpaid) {
    return (
      <div className="vt-confirmation__actions vt-confirmation__actions--pair" data-confirmation-actions>
        <Button size="lg" href={`/${locale}/checkout`}>
          {t("finishPayment")}
        </Button>
      </div>
    );
  }
  return (
    <div className="vt-confirmation__actions vt-confirmation__actions--pair" data-confirmation-actions>
      <Button size="lg" href={manageHref} data-confirmation-manage>
        {t("manageBooking")}
      </Button>
      <Button size="lg" variant="secondary" onClick={() => window.print()} data-confirmation-print>
        {t("download-voucher")}
      </Button>
    </div>
  );
}

export function ConfirmationClient({
  locale,
  reference,
  initialPhase,
  booking,
  freeCancelHours,
  manageHref,
}: ConfirmationClientProps) {
  const t = useTranslations("checkout");
  const [draft] = useBookingDraft();
  // 26.1-16 (D-22): the return route adds charge=refunded when this payer's
  // charge lost the race and was refunded. Display hint only.
  const chargeRefunded = useSearchParams()?.get("charge") === "refunded";
  const router = useRouter();
  const [elapsedMs, setElapsedMs] = useState(0);
  const [liveStatus, setLiveStatus] = useState(booking?.status ?? "");
  const [livePayment, setLivePayment] = useState(booking?.paymentStatus ?? null);
  // Return path: S3 until booked. Later visits skip straight to the page.
  const onReturnPath = initialPhase === "processing";
  const returnPhase = onReturnPath
    ? confirmationPhase({ elapsedMs, status: liveStatus, paymentStatus: livePayment })
    : null;
  const waiting = returnPhase === "confirming" || returnPhase === "received";
  const refreshed = useRef(false);

  useEffect(() => {
    setLiveStatus(booking?.status ?? "");
    setLivePayment(booking?.paymentStatus ?? null);
  }, [booking?.status, booking?.paymentStatus]);

  useEffect(() => {
    if (!waiting) return;
    const started = Date.now() - elapsedMs;
    const clock = window.setInterval(() => setElapsedMs(Date.now() - started), 1000);
    return () => window.clearInterval(clock);
    // elapsedMs is read once on (re)start only.
  }, [waiting]);

  useEffect(() => {
    if (!waiting) return;
    let stopped = false;
    let timeoutId = 0;

    async function tick() {
      if (stopped) return;
      const hidden = typeof document !== "undefined" && document.hidden;
      if (!hidden) {
        try {
          const res = await fetch(`/api/checkout/status/${encodeURIComponent(reference)}`, {
            cache: "no-store",
            credentials: "include",
          });
          const seen = pollStatus(await res.json());
          if (seen) {
            if (seen.status) setLiveStatus(seen.status);
            if (seen.paymentStatus) setLivePayment(seen.paymentStatus);
          }
        } catch {
          // Network blip: keep polling quietly. No error copy on this path.
        }
      }
      if (stopped) return;
      timeoutId = window.setTimeout(tick, POLL_INTERVAL_MS);
    }

    function onVisibility() {
      if (document.hidden) {
        window.clearTimeout(timeoutId);
        return;
      }
      if (stopped) return;
      timeoutId = window.setTimeout(tick, POLL_INTERVAL_MS);
    }

    document.addEventListener("visibilitychange", onVisibility);
    timeoutId = window.setTimeout(tick, 0);
    return () => {
      stopped = true;
      window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [waiting, reference]);

  // The booking was not readable when the page rendered (cookie race). Once it
  // is booked, ask the server component for the facts once.
  useEffect(() => {
    if (returnPhase !== "booked" || booking?.receipt?.rows?.length || refreshed.current) return;
    refreshed.current = true;
    router.refresh();
  }, [returnPhase, booking, router]);

  if (initialPhase === "hidden") {
    return (
      <main className="vt-confirmation" data-confirmation data-confirmation-state="hidden">
        <div className="vt-confirmation__hero">
          <h1 className="vt-confirmation__title">{t("notVisibleTitle")}</h1>
          <p className="vt-confirmation__lede">{t("notVisibleBody")}</p>
        </div>
      </main>
    );
  }

  if (waiting) {
    return (
      <LoadingScreen
        received={returnPhase === "received"}
        reference={reference}
        locale={locale}
      />
    );
  }

  // Pay already confirms the booking. There is no coupon/voucher
  // confirmation step — paint the transfer ticket. The poller still
  // swaps to FailedRoom if payment actually failed.
  const facts: ConfirmationFacts | null = booking
    ? {
        ...booking,
        status: liveStatus || booking.status,
        paymentStatus: livePayment ?? booking.paymentStatus,
      }
    : null;
  const badge = voucherBadgeStatus(facts?.status, facts?.paymentStatus ?? null);
  const unpaid = voucherNeedsPayment(badge);
  const isBookedBadge = badge === "paid" || badge === "confirmed" || badge === "assigned";
  // S4: the booked page. Cancelled, refunded and finished trips keep their own headings.
  const booked = isBookedBadge && (returnPhase === "booked" || !onReturnPath);
  const pageState = booked ? "booked" : badge;
  const reviewHref =
    badge === "completed" && !facts?.reviewSubmitted ? `/${locale}/review` : undefined;
  // Time, flight and cancel live on Manage booking only (owner decision 2026-10-01):
  // the old buttons here called sign-in-only routes and did nothing for a guest.
  const manageTo = manageHref || `/${locale}/manage-booking`;
  const fallback = {
    pickup: draft.pickup,
    dropoff: draft.destination,
    date: draft.date,
    time: draft.time,
    passengers: draft.passengers,
  };

  const title =
    badge === "cancelled" || badge === "no-show"
      ? t("bookingCancelledTitle")
      : badge === "refunded"
        ? t("bookingRefundedTitle")
        : unpaid
          ? t("bookingUnpaidTitle")
          : badge === "completed"
            ? t("bookingCompletedTitle")
            : t("yourDriverIsBooked");
  const lede =
    badge === "cancelled" || badge === "no-show" ? (
      t("bookingCancelledLede", { reference })
    ) : badge === "refunded" ? (
      t("bookingRefundedLede", { reference })
    ) : unpaid ? (
      t("unpaidReference", { reference })
    ) : badge === "completed" ? (
      t("bookingCompletedLede", { reference })
    ) : (
      <>
        {t("bookingPrefix")}{" "}
        <span className="vt-confirmation__ref vt-dir-keep" data-confirmation-ref>
          {reference}
        </span>{" "}
        {t("is-confirmed-the-voucher-is-on-its-way-to-your-i")}
      </>
    );

  return (
    <main className="vt-confirmation" data-confirmation data-confirmation-state={pageState}>
      {booked ? (
        <BookedHero
          firstName={firstName(facts?.contactName)}
          reference={reference}
          email={(facts?.contactEmail || "").trim()}
        />
      ) : (
        <div className="vt-confirmation__hero">
          <h1 className="vt-confirmation__title">{title}</h1>
          <p className="vt-confirmation__lede">
            {lede}
            {typeof lede === "string" ? (
              <span className="vt-confirmation__ref vt-dir-keep" hidden data-confirmation-ref>
                {reference}
              </span>
            ) : null}
          </p>
        </div>
      )}

      {chargeRefunded ? (
        <Alert
          tone="info"
          role="status"
          title={t("payLinkRaceRefundedTitle")}
          data-confirmation-charge-refunded
        >
          {t("payLinkRaceRefundedBody")}
        </Alert>
      ) : null}

      {booked ? (
        <BookedCard locale={locale} booking={facts} fallback={fallback} />
      ) : (
        <BookingVoucher
          locale={locale}
          reference={reference}
          booking={facts}
          fallback={fallback}
          reviewHref={reviewHref}
        />
      )}

      <ActionRow locale={locale} manageHref={manageTo} unpaid={unpaid} />
      {booked ? <p className="vt-confirmation__hint">{t("manageHint")}</p> : null}

      {booked ? <NextSteps freeCancelHours={freeCancelHours} /> : null}

      <HelpLine />

      <div className="vt-confirmation__another">
        <Button variant="ghost" href={`/${locale}`}>
          {t("book-another-transfer")}
        </Button>
      </div>
    </main>
  );
}
