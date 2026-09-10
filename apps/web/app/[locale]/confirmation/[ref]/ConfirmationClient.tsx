"use client";

// D-16: this component performs no write and does not confirm a booking.
// TWINT and 3DS may never return to this tab — the poller is the only
// observer, and it is read-only.

import { useEffect, useState, type HTMLAttributes, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/feedback/Alert";
import { Button, Card, CheckerMark, Icon, Logo } from "@/components/core";
import type { IconName } from "@/components/core";
import { PriceSummary, RouteSummary, StatusBadge } from "@/components/transfer";
import type { PriceLine } from "@/components/transfer/PriceSummary";
import { useBookingDraft } from "@/lib/booking-draft";
import { PHONE_DISPLAY, PHONE_HREF, WHATSAPP_HREF } from "@/lib/contact-channels";
import {
  addMinutesLocal,
  couponOnReceipt,
  extraRappenByCode,
  extrasOnReceipt,
  formatPaidAt,
  formatTripDate,
  formatTripTime,
  rappenToMajor,
  receiptPriceSplit,
} from "@/lib/checkout/confirmation-receipt";
import { formatAmount } from "@/lib/currency";
import {
  isCapturedPayment,
  isFailedPayment,
  isFailedStatus,
  isVoucherStatus,
} from "@/lib/checkout/booking-status";

export type ConfirmationPhase = "hidden" | "processing" | "confirmed" | "give-up" | "failed";

/**
 * First status GET is immediate so a fast webhook paints the voucher
 * without a two-second blank wait.
 */
export const POLL_INTERVAL_MS = 1000;

/**
 * Cap kept for tests that import the name. The wait room polls on a
 * fixed 1s beat so a late webhook still paints the voucher.
 */
export const POLL_BACKOFF_MAX_MS = 1000;

/**
 * Visual "still confirming" copy only. Polling does not stop here.
 */
export const POLL_GIVE_UP_MS = 12_000;

export type ConfirmationFacts = {
  reference: string;
  pickupText: string;
  dropoffText: string;
  scheduledLocal: string;
  pax: number;
  bags?: number;
  flightNo?: string;
  extras?: import("@vamos/emails/confirmation").PayLinkExtraCode[];
  vehicleClassSlug?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  couponCode?: string | null;
  discountRappen?: number | null;
  subtotalRappen?: number | null;
  priceTotalRappen?: number | null;
  fareLines?: import("@/lib/checkout/booking-read").ConfirmationFareLine[];
  durationMin?: number | null;
  distanceKm?: number | null;
  paidAt?: string | null;
  paymentStatus?: string | null;
};

export type ConfirmationClientProps = {
  locale: string;
  reference: string;
  initialPhase: ConfirmationPhase;
  booking: ConfirmationFacts | null;
  freeCancelHours: number | null;
};

function wallTime(scheduledLocal: string): { date: string; time: string } {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(scheduledLocal);
  if (match) return { date: match[1]!, time: match[2]! };
  return { date: scheduledLocal, time: "" };
}

function asStringField(json: object, key: string): string {
  if (!(key in json)) return "";
  const value = (json as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function pollOutcome(json: unknown): "confirmed" | "failed" | "wait" {
  if (!json || typeof json !== "object") return "wait";
  if ("visible" in json && (json as { visible: unknown }).visible === false) return "wait";
  const status = asStringField(json, "status");
  const paymentStatus = asStringField(json, "paymentStatus");
  if (isVoucherStatus(status) || isCapturedPayment(paymentStatus)) return "confirmed";
  if (isFailedPayment(paymentStatus) || isFailedStatus(status)) return "failed";
  return "wait";
}

function FailedRoom({ reference }: { reference: string }) {
  const t = useTranslations("checkout");
  const tCommon = useTranslations("common");
  return (
    <main className="vt-confirmation" data-confirmation data-confirmation-state="failed">
      <Card padding="lg" className="vt-confirmation__wait" data-confirmation-failed>
        <div className="vt-confirmation__wait-head">
          <StatusBadge status="cancelled" />
        </div>
        <h1 className="vt-confirmation__title">{t("failedTitle")}</h1>
        <p className="vt-confirmation__lede">{t("failedBody", { reference })}</p>
        <p className="vt-confirmation__wait-ref">
          {t("bookingPrefix")}{" "}
          <span className="vt-confirmation__ref vt-dir-keep" data-confirmation-ref>
            {reference}
          </span>
        </p>
        <div className="vt-confirmation__help">
          <Button href={PHONE_HREF} icon="phone" variant="secondary" size="md">
            <span className="vt-dir-keep">{PHONE_DISPLAY}</span>
          </Button>
          <Button href={WHATSAPP_HREF} icon="message-circle" variant="ghost" size="md">
            {tCommon("whatsapp")}
          </Button>
        </div>
      </Card>
    </main>
  );
}

function ReceiptRow({
  icon,
  label,
  children,
  ...dd
}: {
  icon: IconName;
  label: string;
  children: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  return (
    <div className="vt-confirmation__receipt-row">
      <dt>
        <Icon name={icon} size={12} />
        {label}
      </dt>
      <dd {...dd}>{children}</dd>
    </div>
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
  const [phase, setPhase] = useState<ConfirmationPhase>(initialPhase);
  const waiting = phase === "processing" || phase === "give-up";

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
          const json: unknown = await res.json();
          const outcome = pollOutcome(json);
          if (outcome === "confirmed") {
            setPhase("confirmed");
            return;
          }
          if (outcome === "failed") {
            setPhase("failed");
            return;
          }
        } catch {
          // Network blip — keep polling until the voucher or an error lands.
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

  const pickup = (booking?.pickupText && booking.pickupText.trim()) || draft.pickup;
  const dropoff = (booking?.dropoffText && booking.dropoffText.trim()) || draft.destination;
  const scheduled = booking?.scheduledLocal
    ? wallTime(booking.scheduledLocal)
    : { date: draft.date, time: draft.time };
  const dateLabel = booking?.scheduledLocal
    ? formatTripDate(booking.scheduledLocal, locale)
    : scheduled.date;
  const timeLabel = booking?.scheduledLocal ? formatTripTime(booking.scheduledLocal) : scheduled.time;
  const pax = booking && booking.pax > 0 ? booking.pax : draft.passengers;
  const bags = booking && booking.bags != null ? booking.bags : 0;
  const flightNo = (booking?.flightNo || "").trim();
  const extras = extrasOnReceipt(booking?.extras);
  const extraLabel: Record<string, "childSeat" | "extraOversized" | "extraStop"> = {
    child_seat: "childSeat",
    oversized_luggage: "extraOversized",
    extra_stop: "extraStop",
  };
  const durationMin = booking?.durationMin != null && booking.durationMin > 0 ? booking.durationMin : null;
  const arriveLabel =
    booking?.scheduledLocal && durationMin != null ? addMinutesLocal(booking.scheduledLocal, durationMin) : "";
  const distanceKm =
    booking?.distanceKm != null && Number.isFinite(booking.distanceKm)
      ? Math.round(booking.distanceKm * 10) / 10
      : null;

  if (phase === "hidden") {
    return (
      <main className="vt-confirmation" data-confirmation data-confirmation-state="hidden">
        <div className="vt-confirmation__hero">
          <h1 className="vt-confirmation__title">{t("notVisibleTitle")}</h1>
          <p className="vt-confirmation__lede">{t("notVisibleBody")}</p>
        </div>
      </main>
    );
  }

  if (phase === "failed") {
    return <FailedRoom reference={reference} />;
  }

  // Pay already confirms the booking. There is no coupon/voucher
  // confirmation step — paint the transfer ticket. The poller still
  // swaps to FailedRoom if payment actually failed.
  const classSlug = (booking?.vehicleClassSlug || "").trim();
  const vehicleLabel =
    classSlug === "economy"
      ? tCommon("vehicleClassEconomy")
      : classSlug === "business"
        ? tCommon("vehicleClassBusiness")
        : classSlug === "van"
          ? tCommon("vehicleClassVan")
          : classSlug
            ? tCommon("vehicleClassOf", { class: classSlug })
            : tCommon("vehicleClassFallback");
  const classLabelOf = (slug: string) => {
    const value = slug.trim();
    if (value === "economy") return tCommon("vehicleClassEconomy");
    if (value === "business") return tCommon("vehicleClassBusiness");
    if (value === "van") return tCommon("vehicleClassVan");
    if (value) return tCommon("vehicleClassOf", { class: value });
    return vehicleLabel;
  };
  const totalRappen = booking?.priceTotalRappen;
  const totalMajor = rappenToMajor(totalRappen ?? null);
  const fareLines = Array.isArray(booking?.fareLines) ? booking.fareLines : [];
  const coupon = couponOnReceipt({
    couponCode: booking?.couponCode,
    discountRappen: booking?.discountRappen,
    fareLines,
  });
  const subtotalMajor = rappenToMajor(booking?.subtotalRappen ?? null);
  const extraRappen = extraRappenByCode(fareLines);
  const split = receiptPriceSplit({ totalRappen, extraRappen });
  const lines: PriceLine[] = [];
  if (split) {
    lines.push({ label: t("fareExVat"), amount: rappenToMajor(split.fareRappen) });
    for (const extra of split.extras) {
      lines.push({
        label: t(extraLabel[extra.code] ?? "childSeat"),
        amount: rappenToMajor(extra.rappen),
      });
    }
    if (split.vatRappen > 0) {
      lines.push({ label: t("vatIncl"), amount: rappenToMajor(split.vatRappen) });
    }
  } else {
    const fareLinesShown = fareLines.filter((line) => line.code !== "coupon" && line.code !== "discount");
    for (const line of fareLinesShown) {
      if (line.code === "child_seat") {
        lines.push({ label: t("childSeat"), amount: rappenToMajor(line.amountRappen) });
        continue;
      }
      if (line.code === "oversized_luggage") {
        lines.push({ label: t("extraOversized"), amount: rappenToMajor(line.amountRappen) });
        continue;
      }
      if (line.code === "extra_stop") {
        lines.push({ label: t("extraStop"), amount: rappenToMajor(line.amountRappen) });
        continue;
      }
      if (line.code === "vat") {
        lines.push({ label: t("vatIncl"), amount: rappenToMajor(line.amountRappen) });
        continue;
      }
      const cls = classLabelOf(line.vehicleClass || classSlug);
      lines.push({ label: t("transferClass", { class: cls }), amount: rappenToMajor(line.amountRappen) });
    }
  }
  if (coupon) {
    lines.push({
      label: t("couponCode", { code: coupon.code }),
      amount: rappenToMajor(-coupon.rappen),
      credit: true,
    });
  }
  if (lines.length === 0) {
    lines.push({ label: t("transferClass", { class: vehicleLabel }), amount: totalMajor });
  }
  const contactName = (booking?.contactName || "").trim();
  const contactEmail = (booking?.contactEmail || "").trim();
  const contactPhone = (booking?.contactPhone || "").trim();
  const pricedExtra = new Set((split?.extras ?? []).map((row) => row.code));
  const paidAtLabel = booking?.paidAt ? formatPaidAt(booking.paidAt, locale) : "";
  const showCard = Boolean(
    paidAtLabel || isCapturedPayment(booking?.paymentStatus ?? "") || !waiting,
  );

  return (
    <main
      className="vt-confirmation"
      data-confirmation
      data-confirmation-state={waiting ? "processing" : "confirmed"}
    >
      <div className="vt-confirmation__hero">
        <h1 className="vt-confirmation__title">{t("yourDriverIsBooked")}</h1>
        <p className="vt-confirmation__lede">
          {t("bookingPrefix")}{" "}
          <span className="vt-confirmation__ref vt-dir-keep" data-confirmation-ref>
            {reference}
          </span>{" "}
          {t("is-confirmed-the-voucher-is-on-its-way-to-your-i")}
        </p>
      </div>

      <Card tone="inverse" padding="lg" className="vt-confirmation__voucher" data-confirmation-voucher>
        <div className="vt-confirmation__checker">
          <CheckerMark size={96} opacity={0.5} />
        </div>
        <div className="vt-confirmation__voucher-head">
          <Logo variant="white" form="wordmark" height={24} />
          <StatusBadge status="confirmed" />
        </div>
        <RouteSummary
          inverse
          pickup={pickup}
          dropoff={dropoff}
          pickupDetail={
            timeLabel ? (
              <span className="vt-dir-keep" data-confirmation-pickup-at>
                {timeLabel}
              </span>
            ) : undefined
          }
          dropoffDetail={
            arriveLabel ? (
              <span className="vt-dir-keep" data-confirmation-arrive>
                {arriveLabel}
              </span>
            ) : undefined
          }
        />
        <PriceSummary
          inverse
          lines={lines}
          total={totalMajor}
          was={coupon && subtotalMajor != null && subtotalMajor !== totalMajor ? subtotalMajor : null}
          totalLabel={t("paid")}
          note={totalMajor == null ? t("pricePlaceholderNote") : undefined}
        />
        <dl className="vt-confirmation__receipt" data-confirmation-receipt>
          <ReceiptRow icon="ticket" label={t("bookingPrefix")} className="vt-dir-keep">
            {reference}
          </ReceiptRow>
          {dateLabel ? (
            <ReceiptRow icon="calendar" label={t("tripDate")} className="vt-dir-keep">
              {dateLabel}
            </ReceiptRow>
          ) : null}
          <ReceiptRow icon="users" label={tCommon("passengers")}>
            {t("passengersCount", { n: pax })}
          </ReceiptRow>
          <ReceiptRow icon="luggage" label={tCommon("bags-2")}>
            <span data-confirmation-bags>{tCommon("bagsCount", { n: bags })}</span>
          </ReceiptRow>
          <ReceiptRow icon="car" label={tCommon("vehicle")}>
            {vehicleLabel}
          </ReceiptRow>
          {flightNo ? (
            <ReceiptRow icon="plane" label={tCommon("flight-number")} className="vt-dir-keep">
              {flightNo}
            </ReceiptRow>
          ) : null}
          {durationMin != null ? (
            <ReceiptRow icon="clock" label={t("tripDuration")} className="vt-dir-keep">
              {t("durationMinutes", { n: durationMin })}
            </ReceiptRow>
          ) : null}
          {distanceKm != null ? (
            <ReceiptRow icon="navigation" label={t("tripDistance")} className="vt-dir-keep">
              {t("distanceKm", { km: distanceKm })}
            </ReceiptRow>
          ) : null}
          {extras.filter((code) => !pricedExtra.has(code)).map((code) => {
            const rappen = extraRappen[code];
            const amount = rappenToMajor(rappen ?? null);
            const extraIcon: IconName =
              code === "oversized_luggage" ? "luggage" : code === "extra_stop" ? "map-pin" : "baby";
            return (
              <ReceiptRow
                key={code}
                icon={extraIcon}
                label={t("extras")}
                data-confirmation-extra={code}
                data-confirmation-receipt-extra={code}
              >
                {t(extraLabel[code] ?? "childSeat")}
                {amount != null ? (
                  <>
                    {" "}
                    <span className="vt-dir-keep">{formatAmount(amount)}</span>
                  </>
                ) : null}
              </ReceiptRow>
            );
          })}
          {coupon ? (
            <ReceiptRow icon="ticket" label={t("couponUsed")} data-confirmation-coupon className="vt-dir-keep">
              {coupon.code}
            </ReceiptRow>
          ) : null}
          {contactName ? (
            <ReceiptRow icon="user" label={t("paid-by")} data-confirmation-payer>
              {contactName}
            </ReceiptRow>
          ) : null}
          {contactEmail ? (
            <ReceiptRow icon="mail" label={t("payerEmail")} className="vt-dir-keep">
              {contactEmail}
            </ReceiptRow>
          ) : null}
          {contactPhone ? (
            <ReceiptRow icon="phone" label={t("contactPhone")} className="vt-dir-keep">
              {contactPhone}
            </ReceiptRow>
          ) : null}
          {showCard ? (
            <ReceiptRow icon="credit-card" label={t("payment")} data-confirmation-paid-with>
              {t("paidWithCard")}
            </ReceiptRow>
          ) : null}
          {paidAtLabel ? (
            <ReceiptRow icon="calendar" label={t("paidAt")} data-confirmation-paid-at className="vt-dir-keep">
              {paidAtLabel}
            </ReceiptRow>
          ) : null}
        </dl>
      </Card>

      <div className="vt-confirmation__actions">
        <Button icon="printer" variant="secondary" onClick={() => window.print()}>
          {t("download-voucher")}
        </Button>
        <Button icon="calendar-days" variant="ghost" href={`/api/checkout/invite/${encodeURIComponent(reference)}`}>
          {t("add-to-calendar")}
        </Button>
        <Button icon="pencil" variant="ghost" href={`/${locale}/manage-booking`}>
          {t("manageBooking")}
        </Button>
        <Button icon="mail" variant="ghost" disabled title={t("resendEmailSoon")}>
          {t("resendEmail")}
        </Button>
      </div>

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

      <div className="vt-confirmation__footer">
        <Button variant="ghost" iconEnd="arrow-right" href={`/${locale}`}>
          {t("book-another-transfer")}
        </Button>
      </div>
    </main>
  );
}
