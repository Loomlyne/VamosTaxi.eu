"use client";

// D-16: this component performs no write and does not confirm a booking.
// TWINT and 3DS may never return to this tab — the poller is the only
// observer, and it is read-only.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/feedback/Alert";
import { Dialog } from "@/components/feedback/Dialog";
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
import { customerCancelWindow } from "@/lib/checkout/cancel-window";

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
};

function asStringField(json: object, key: string): string {
  if (!(key in json)) return "";
  const value = (json as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function hoursBeforePickup(scheduledLocal: string, now: Date): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(scheduledLocal.trim());
  if (!match) return 0;
  const wall = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00`;
  const asUtc = Date.parse(`${wall}Z`);
  if (!Number.isFinite(asUtc)) return 0;
  const zurich = new Date(asUtc).toLocaleString("sv-SE", { timeZone: "Europe/Zurich" });
  const zurichUtc = Date.parse(zurich.replace(" ", "T") + "Z");
  if (!Number.isFinite(zurichUtc)) return (asUtc - now.getTime()) / 3_600_000;
  const pickup = asUtc + (asUtc - zurichUtc);
  return (pickup - now.getTime()) / 3_600_000;
}

function pollStatus(json: unknown): { status: string; paymentStatus: string } | null {
  if (!json || typeof json !== "object") return null;
  if ("visible" in json && (json as { visible: unknown }).visible === false) return null;
  return { status: asStringField(json, "status"), paymentStatus: asStringField(json, "paymentStatus") };
}

function HelpRow() {
  const tCommon = useTranslations("common");
  return (
    <div className="vt-confirmation__help">
      <Button href={PHONE_HREF} variant="secondary" size="md">
        <Icon name="phone" size={18} />
        <span className="vt-dir-keep">{PHONE_DISPLAY}</span>
      </Button>
      <Button href={WHATSAPP_HREF} variant="ghost" size="md">
        <Icon name="message-circle" size={18} />
        {tCommon("whatsapp")}
      </Button>
    </div>
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

/** S4 head: disc, kicker, display heading, reference and e-mail line, status badge. */
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
      <span className="vt-confirmation__disc" aria-hidden="true">
        <Icon name="check" size={28} color="var(--vt-yellow)" />
      </span>
      <p className="vt-confirmation__kicker vt-confirmation__kicker--booked">{t("statusBooked")}</p>
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
      <div>
        <StatusBadge status="confirmed" label={t("statusBooked")} />
      </div>
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
    <div className="vt-confirmation__receipt-row">
      <dt>
        <Icon name={icon} size={12} />
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

/** S4 body: route, trip facts, the e-mail's money rows, the legal line. */
function BookedCard({
  locale,
  booking,
  fallback,
  cancelSlot,
}: {
  locale: string;
  booking: ConfirmationFacts | null;
  fallback: { pickup: string; dropoff: string; date: string; time: string; passengers: number };
  cancelSlot: ReactNode;
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
      <dl className="vt-confirmation__receipt" data-confirmation-receipt>
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
      <p className="vt-confirmation__legal">{t("by-continuing-you-accept-the-terms-and-the-cance")}</p>
      {cancelSlot ? <div className="vt-confirmation__booked-cancel">{cancelSlot}</div> : null}
    </Card>
  );
}

export function ConfirmationClient({
  locale,
  reference,
  initialPhase,
  booking,
  freeCancelHours,
}: ConfirmationClientProps) {
  const t = useTranslations("checkout");
  const tCommon = useTranslations("common");
  const [draft] = useBookingDraft();
  // 26.1-16 (D-22): the return route adds charge=refunded when this payer's
  // charge lost the race and was refunded. Display hint only.
  const chargeRefunded = useSearchParams()?.get("charge") === "refunded";
  const router = useRouter();
  const [elapsedMs, setElapsedMs] = useState(0);
  const [liveStatus, setLiveStatus] = useState(booking?.status ?? "");
  const [livePayment, setLivePayment] = useState(booking?.paymentStatus ?? null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [refundFailed, setRefundFailed] = useState(false);
  const [refundStatus, setRefundStatus] = useState(booking?.refundStatus ?? null);
  // D-23a: refund amount from the cancel response, printed on the voucher.
  const [refundRappen, setRefundRappen] = useState<number | null>(booking?.refundOwedRappen ?? null);
  const [payoutCountry, setPayoutCountry] = useState(booking?.payoutCountry ?? null);
  const [availableOn, setAvailableOn] = useState(booking?.availableOn ?? null);
  const [reviewedStay] = useState(Boolean(booking?.reviewSubmitted));
  const [newPickup, setNewPickup] = useState("");
  const [flightNo, setFlightNo] = useState("");
  const [lifeMsg, setLifeMsg] = useState("");
  const [lifeBusy, setLifeBusy] = useState(false);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        refundStatus: refundStatus ?? booking.refundStatus,
        refundOwedRappen: refundRappen ?? booking.refundOwedRappen ?? null,
        payoutCountry: payoutCountry ?? booking.payoutCountry,
        availableOn: availableOn ?? booking.availableOn,
        reviewSubmitted: reviewedStay,
      }
    : null;
  const badge = voucherBadgeStatus(facts?.status, facts?.paymentStatus ?? null);
  const unpaid = voucherNeedsPayment(badge);
  const isBookedBadge = badge === "paid" || badge === "confirmed" || badge === "assigned";
  // S4: the booked page. Cancelled, refunded and finished trips keep their own headings.
  const booked = isBookedBadge && (returnPhase === "booked" || !onReturnPath);
  const pageState = booked ? "booked" : badge;
  const rawStatus = (facts?.status || "").toLowerCase();
  const hideCancel =
    unpaid ||
    reviewedStay ||
    badge === "completed" ||
    badge === "no-show" ||
    badge === "cancelled" ||
    badge === "refunded" ||
    badge === "pending" ||
    badge === "quote" ||
    rawStatus === "completed" ||
    rawStatus === "no_show" ||
    rawStatus === "cancelled";
  const showCancel = Boolean(facts) && !hideCancel;
  // D-23/D-24 (26.1-18): >24 h auto full refund; every later paid cancel goes to
  // the admin review. No time-based "too close to cancel" state is left.
  const windowKind = customerCancelWindow(hoursBeforePickup(facts?.scheduledLocal || "", new Date()));
  const canConfirmCancel = showCancel;
  const sheetCopy = windowKind === "auto_full" ? t("cancelSheetFull") : t("cancelSheetOps");
  const reviewHref =
    badge === "completed" && !reviewedStay ? `/${locale}/review` : undefined;

  async function confirmPaidCancel() {
    if (cancelling || !canConfirmCancel) return;
    setCancelling(true);
    try {
      const res = await fetch("/api/account/bookings/paid-cancel", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ref: reference }),
      });
      const json: unknown = await res.json().catch(() => null);
      const code =
        json && typeof json === "object" && "code" in json && typeof (json as { code: unknown }).code === "string"
          ? (json as { code: string }).code
          : "";
      const ok = json && typeof json === "object" && "ok" in json && (json as { ok: unknown }).ok === true;
      const stripeFail = code === "stripe-failed" || code === "stripe-test-only";
      if (!ok && !stripeFail) return;
      const rec = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
      setLiveStatus("cancelled");
      setRefundStatus(typeof rec.refundStatus === "string" ? rec.refundStatus : stripeFail ? "failed" : null);
      setRefundRappen(typeof rec.refundRappen === "number" && rec.refundRappen > 0 ? rec.refundRappen : null);
      setPayoutCountry(typeof rec.payoutCountry === "string" ? rec.payoutCountry : null);
      setAvailableOn(typeof rec.availableOn === "string" ? rec.availableOn : null);
      setRefundFailed(stripeFail);
      setSheetOpen(false);
    } finally {
      setCancelling(false);
    }
  }

  async function requestTimeChange() {
    if (lifeBusy || !newPickup.trim()) return;
    setLifeBusy(true);
    try {
      const res = await fetch("/api/account/bookings/time-change", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ref: reference, scheduled_local: newPickup.trim() }),
      });
      const json: unknown = await res.json().catch(() => null);
      const ok = json && typeof json === "object" && "ok" in json && (json as { ok: unknown }).ok === true;
      setLifeMsg(
        ok
          ? t("timeChangeRequested", { original: facts?.scheduledLocal || newPickup })
          : t("timeChangeFailed"),
      );
    } finally {
      setLifeBusy(false);
    }
  }

  async function saveFlightNumber() {
    if (lifeBusy || !flightNo.trim()) return;
    setLifeBusy(true);
    try {
      const res = await fetch("/api/account/bookings/flight", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ref: reference, flight_no: flightNo.trim() }),
      });
      const json: unknown = await res.json().catch(() => null);
      const ok = json && typeof json === "object" && "ok" in json && (json as { ok: unknown }).ok === true;
      setLifeMsg(ok ? t("flightSaved") : t("flightSaveFailed"));
    } finally {
      setLifeBusy(false);
    }
  }

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
  const showConfirmedChrome = !unpaid && badge !== "cancelled" && badge !== "refunded" && badge !== "no-show";

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
        <BookedCard
          locale={locale}
          booking={facts}
          fallback={{
            pickup: draft.pickup,
            dropoff: draft.destination,
            date: draft.date,
            time: draft.time,
            passengers: draft.passengers,
          }}
          cancelSlot={
            showCancel ? (
              <Button variant="ghost" size="md" onClick={() => setSheetOpen(true)}>
                {t("cancelBooking")}
              </Button>
            ) : null
          }
        />
      ) : (
        <BookingVoucher
          locale={locale}
          reference={reference}
          booking={facts}
          fallback={{
            pickup: draft.pickup,
            dropoff: draft.destination,
            date: draft.date,
            time: draft.time,
            passengers: draft.passengers,
          }}
          reviewHref={reviewHref}
          cancelSlot={
            showCancel ? (
              <Button variant="ghost" size="md" onClick={() => setSheetOpen(true)}>
                {t("cancelBooking")}
              </Button>
            ) : null
          }
        />
      )}

      {showConfirmedChrome && facts ? (
        <div className="vt-confirmation__actions" data-time-change data-flight>
          <label>
            {t("requestTimeChange")}
            <input
              type="datetime-local"
              value={newPickup}
              onChange={(e) => setNewPickup(e.target.value)}
            />
          </label>
          <Button size="md" onClick={() => void requestTimeChange()} disabled={lifeBusy}>
            {t("requestTimeChange")}
          </Button>
          <label>
            {t("saveFlightNumber")}
            <input value={flightNo} onChange={(e) => setFlightNo(e.target.value.toUpperCase())} />
          </label>
          <Button size="md" variant="secondary" onClick={() => void saveFlightNumber()} disabled={lifeBusy}>
            {t("saveFlightNumber")}
          </Button>
          {lifeMsg ? <p>{lifeMsg}</p> : null}
        </div>
      ) : null}

      <Dialog
        open={sheetOpen}
        title={t("cancelThisTransfer")}
        closeLabel={tCommon("close")}
        onClose={() => {
          if (!cancelling) setSheetOpen(false);
        }}
        footer={
          <>
            {canConfirmCancel ? (
              <Button variant="danger" size="md" onClick={() => void confirmPaidCancel()} disabled={cancelling}>
                {t("confirmCancellation")}
              </Button>
            ) : null}
            <Button variant="ghost" size="md" onClick={() => setSheetOpen(false)} disabled={cancelling}>
              {t("keepMyBooking")}
            </Button>
          </>
        }
      >
        <p>{sheetCopy}</p>
      </Dialog>

      {booked ? (
        <div className="vt-confirmation__actions">
          <Button variant="secondary" href={`/${locale}/manage-booking`}>
            {t("manageBooking")}
          </Button>
          <Button variant="ghost" href={`/${locale}`}>
            {t("book-another-transfer")}
          </Button>
        </div>
      ) : (
        <div className="vt-confirmation__actions">
          {unpaid ? (
            <Button icon="credit-card" href={`/${locale}/checkout`}>
              {t("finishPayment")}
            </Button>
          ) : (
            <Button icon="printer" variant="secondary" onClick={() => window.print()}>
              {t("download-voucher")}
            </Button>
          )}
          <Button icon="pencil" variant="ghost" href={`/${locale}/manage-booking`}>
            {t("manageBooking")}
          </Button>
        </div>
      )}

      <HelpRow />

      {refundFailed ? (
        <div className="vt-confirmation__alerts">
          <Alert tone="danger" title={t("bookingCancelledTitle")}>
            {t("refundFailedRetry")}
          </Alert>
        </div>
      ) : null}

      {showConfirmedChrome ? (
        <div className="vt-confirmation__alerts">
          <Alert tone="success" title={t("whatHappensNext")}>
            {t("whatHappensNextBody")}
          </Alert>
          <Alert tone="inverse" title={t("changed-plans")}>
            {freeCancelHours == null
              ? t("cancel-free-of-charge-up-to-24-hours-before-pick")
              : t("freeCancelHours", { hours: freeCancelHours })}
          </Alert>
        </div>
      ) : null}

      {booked ? null : (
        <div className="vt-confirmation__footer">
          <Button variant="ghost" iconEnd="arrow-right" href={`/${locale}`}>
            {t("book-another-transfer")}
          </Button>
        </div>
      )}
    </main>
  );
}
