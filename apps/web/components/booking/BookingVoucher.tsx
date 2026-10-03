"use client";

import "./BookingVoucher.css";
import { type HTMLAttributes, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button, Card, CheckerMark, Icon, Logo } from "@/components/core";
import type { IconName } from "@/components/core";
import { PriceSummary, RouteSummary, StatusBadge } from "@/components/transfer";
import type { BookingStatus } from "@/components/transfer/StatusBadge";
import type { PriceLine } from "@/components/transfer/PriceSummary";
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
import type { ReceiptRow } from "@/lib/checkout/confirmation-receipt";
import { formatAmount } from "@/lib/currency";
import { isCapturedPayment } from "@/lib/checkout/booking-status";
import {
  voucherBadgeStatus,
  voucherNeedsPayment,
  voucherRefundAmountRappen,
  voucherRefundLabelKey,
} from "@/lib/checkout/voucher-badge";

export type BookingVoucherFacts = {
  reference?: string;
  status?: string;
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
  refundStatus?: string | null;
  /** D-23a: amount the admin decided / the automatic refund owes, in rappen. */
  refundOwedRappen?: number | null;
  /** D-23a: amount actually refunded to the card, in rappen. */
  refundedRappen?: number | null;
  payoutCountry?: string | null;
  availableOn?: string | null;
  reviewSubmitted?: boolean;
  /** 26.2 audit U06-1: the snapshot receipt (same rows as the e-mail and the booked card). */
  receipt?: { rows: ReceiptRow[]; vehicleClassName?: string | null };
};

export type BookingVoucherFallback = {
  pickup?: string;
  dropoff?: string;
  date?: string;
  time?: string;
  passengers?: number;
};

export type BookingVoucherProps = {
  locale: string;
  reference: string;
  booking: BookingVoucherFacts | null;
  fallback?: BookingVoucherFallback;
  cancelSlot?: ReactNode;
  reviewHref?: string;
};

function regionName(iso: string, locale: string): string {
  const code = iso.trim().toUpperCase();
  if (!code) return "";
  try {
    const tag = locale === "ar" ? "ar" : locale === "de" ? "de" : locale === "fr" ? "fr" : "en";
    return new Intl.DisplayNames([tag], { type: "region" }).of(code) || "";
  } catch {
    return "";
  }
}

/** 26.2 audit U06-19: the payout day as a localised date, never the raw ISO string. */
function payoutDate(iso: string, locale: string): string {
  const trimmed = iso.trim();
  if (!trimmed) return "";
  const day = trimmed.slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  try {
    const tag = locale === "ar" ? "ar" : locale === "de" ? "de-CH" : locale === "fr" ? "fr-CH" : "en-GB";
    return new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))),
    );
  } catch {
    return day;
  }
}

/** 26.2 audit U06-1: money lines from the snapshot rows, so any owner-added extra shows by its own name. */
function receiptMoneyLines(
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
      lines.push({ label: <span data-confirmation-extra="1">{row.label}</span>, amount });
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

function wallTime(scheduledLocal: string): { date: string; time: string } {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(scheduledLocal);
  if (match) return { date: match[1]!, time: match[2]! };
  return { date: scheduledLocal, time: "" };
}

function ReceiptRow({
  icon,
  label,
  children,
  ...dd
}: {
  icon?: IconName;
  label: string;
  children: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  return (
    <div className="vt-confirmation__receipt-row">
      <dt>
        {icon ? <Icon name={icon} size={12} /> : null}
        {label}
      </dt>
      <dd {...dd}>{children}</dd>
    </div>
  );
}

export function BookingVoucher({
  locale,
  reference,
  booking,
  fallback,
  cancelSlot,
  reviewHref,
}: BookingVoucherProps) {
  const t = useTranslations("checkout");
  const tCommon = useTranslations("common");
  const tBadge = useTranslations("statusBadge");

  const badge: BookingStatus = voucherBadgeStatus(booking?.status, booking?.paymentStatus ?? null);
  const unpaid = voucherNeedsPayment(badge);
  const badgeLabel = unpaid ? t("needsPayment") : undefined;

  const pickup = (booking?.pickupText && booking.pickupText.trim()) || fallback?.pickup || "";
  const dropoff = (booking?.dropoffText && booking.dropoffText.trim()) || fallback?.dropoff || "";
  const scheduled = booking?.scheduledLocal
    ? wallTime(booking.scheduledLocal)
    : { date: fallback?.date || "", time: fallback?.time || "" };
  const dateLabel = booking?.scheduledLocal
    ? formatTripDate(booking.scheduledLocal, locale)
    : scheduled.date;
  const timeLabel = booking?.scheduledLocal ? formatTripTime(booking.scheduledLocal) : scheduled.time;
  const pax = booking && booking.pax > 0 ? booking.pax : fallback?.passengers || 0;
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
            : t("vehicleClassFallback");
  // Same rule as the booked card: a class name only when the class is one we can name.
  const vehicleLabelOrEmpty =
    classSlug === "economy" || classSlug === "business" || classSlug === "van" ? vehicleLabel : "";
  const classLabelOf = (slug: string) => {
    const value = slug.trim();
    if (value === "economy") return tCommon("vehicleClassEconomy");
    if (value === "business") return tCommon("vehicleClassBusiness");
    if (value === "van") return tCommon("vehicleClassVan");
    if (value) return tCommon("vehicleClassOf", { class: value });
    return vehicleLabel;
  };
  const totalRappen = booking?.priceTotalRappen;
  const totalMajorRaw = rappenToMajor(totalRappen ?? null);
  const fareLines = Array.isArray(booking?.fareLines) ? booking.fareLines : [];
  const coupon = couponOnReceipt({
    couponCode: booking?.couponCode,
    discountRappen: booking?.discountRappen,
    fareLines,
  });
  const subtotalMajor = rappenToMajor(booking?.subtotalRappen ?? null);
  const extraRappen = extraRappenByCode(fareLines);
  const split = receiptPriceSplit({
    totalRappen,
    extraRappen,
    discountRappen: coupon?.rappen ?? booking?.discountRappen,
  });
  const lines: PriceLine[] = [];
  const snapshotRows = booking?.receipt?.rows ?? [];
  const useRows = snapshotRows.length > 0;
  let rowsTotal: number | null = null;
  if (useRows) {
    const shown = receiptMoneyLines(snapshotRows, booking?.receipt?.vehicleClassName?.trim() || vehicleLabelOrEmpty, t);
    lines.push(...shown.lines);
    rowsTotal = shown.total;
  } else if (split) {
    lines.push({ label: t("fareExVat"), amount: rappenToMajor(split.fareRappen) });
    for (const extra of split.extras) {
      lines.push({
        label: (
          <span data-confirmation-extra={extra.code}>{`+ ${t(extraLabel[extra.code] ?? "childSeat")}`}</span>
        ),
        amount: rappenToMajor(extra.rappen),
      });
    }
    if (split.vatRappen > 0) {
      lines.push({ label: t("vatIncl"), amount: rappenToMajor(split.vatRappen) });
    }
    if (coupon && split.couponRappen > 0) {
      lines.push({
        label: (
          <span data-confirmation-coupon={coupon.code}>
            {split.couponPercent
              ? t("couponPercentOff", { percent: split.couponPercent })
              : t("couponCode", { code: coupon.code })}
          </span>
        ),
        amount: rappenToMajor(-split.couponRappen),
        credit: true,
      });
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
    if (coupon) {
      lines.push({
        label: (
          <span data-confirmation-coupon={coupon.code}>{t("couponCode", { code: coupon.code })}</span>
        ),
        amount: rappenToMajor(-coupon.rappen),
        credit: true,
      });
    }
  }
  const totalMajor = totalMajorRaw ?? rowsTotal;
  if (lines.length === 0) {
    lines.push({ label: t("transferClass", { class: vehicleLabel }), amount: totalMajor });
  }
  const contactName = (booking?.contactName || "").trim();
  const contactEmail = (booking?.contactEmail || "").trim();
  const contactPhone = (booking?.contactPhone || "").trim();
  // With snapshot rows every extra is already a priced line above, so the facts list shows none twice.
  const pricedExtra = new Set(useRows ? extras : (split?.extras ?? []).map((row) => row.code));
  const paidAtLabel = booking?.paidAt ? formatPaidAt(booking.paidAt, locale) : "";
  const captured = isCapturedPayment(booking?.paymentStatus ?? "");
  const showCard = Boolean(paidAtLabel || captured || (!unpaid && badge !== "cancelled" && badge !== "refunded" && badge !== "no-show"));
  const totalLabel =
    badge === "refunded"
      ? tBadge("refunded")
      : unpaid
        ? t("needsPayment")
        : t("paid");
  const refundStatus = (booking?.refundStatus || "").trim().toLowerCase();
  const refundKey = voucherRefundLabelKey(refundStatus);
  const refundLabel = refundKey === "refunded" ? tBadge("refunded") : refundKey ? t(refundKey) : "";
  // D-23a: the refund is a money line, not only a status word.
  const refundAmountRappen = voucherRefundAmountRappen({
    refundStatus,
    refundOwedRappen: booking?.refundOwedRappen ?? null,
    refundedRappen: booking?.refundedRappen ?? null,
  });
  const refundAmountMajor = rappenToMajor(refundAmountRappen);
  const country =
    regionName(booking?.payoutCountry || "", locale) || t("switzerland");
  const onDate = booking?.availableOn ? payoutDate(booking.availableOn, locale) : "";
  // 26.2 audit U06-19: both sentences carry their own full stop; no literal joiner, and the
  // date is wrapped in LRI/PDI isolates so it keeps its own direction inside Arabic text
  // (the message text cannot take a className around one placeholder).
  const refundedCopy =
    refundStatus === "refunded" ? (
      <>
        {t("refundedToCard", { country })}
        {onDate ? (
          <>
            {" "}
            {t("stripePayoutOn", { date: `\u2066${onDate}\u2069` })}
          </>
        ) : null}
      </>
    ) : null;
  const reviewed = Boolean(booking?.reviewSubmitted);
  const showReview = Boolean(reviewHref) && !reviewed && badge === "completed";

  return (
    <Card
      tone="inverse"
      padding="lg"
      className="vt-confirmation__voucher"
      data-confirmation-voucher
      data-confirmation-voucher-status={badge}
    >
      <div className="vt-confirmation__checker">
        <CheckerMark size={96} opacity={0.5} />
      </div>
      <div className="vt-confirmation__voucher-head">
        <Logo variant="white" form="wordmark" height={24} />
        <span className="vt-confirmation__voucher-pills">
          <StatusBadge status={badge} label={badgeLabel} />
          {reviewed ? (
            <span data-confirmation-reviewed="1" className="vt-confirmation__reviewed">
              {t("reviewed")}
            </span>
          ) : null}
          {/* Reviewed stays after submit (D-21). */}
        </span>
      </div>
      <RouteSummary
        inverse
        pickup={
          <span className="vt-confirmation__place">
            <Icon name="map-pin" size={16} />
            {pickup}
          </span>
        }
        dropoff={
          <span className="vt-confirmation__place">
            <Icon name="navigation" size={16} />
            {dropoff}
          </span>
        }
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
        duration={
          durationMin != null ? (
            <span className="vt-confirmation__when vt-dir-keep" data-confirmation-duration>
              <Icon name="clock" size={14} />
              {t("durationMinutes", { n: durationMin })}
            </span>
          ) : undefined
        }
      />
      <PriceSummary
        inverse
        lines={lines}
        total={totalMajor}
        was={coupon && subtotalMajor != null && subtotalMajor !== totalMajor ? subtotalMajor : null}
        totalLabel={totalLabel}
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
        {distanceKm != null ? (
          <ReceiptRow icon="navigation" label={t("tripDistance")} className="vt-dir-keep">
            {t("distanceKm", { km: distanceKm })}
          </ReceiptRow>
        ) : null}
        {extras
          .filter((code) => !pricedExtra.has(code))
          .map((code) => {
            const rappen = extraRappen[code];
            const amount = rappenToMajor(rappen ?? null);
            return (
              <ReceiptRow
                key={code}
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
        {refundLabel ? (
          <ReceiptRow icon="credit-card" label={t("refund")} data-confirmation-refund>
            {refundLabel}
            {refundAmountMajor != null ? (
              <>
                {" · "}
                <span className="vt-dir-keep" data-confirmation-refund-amount>
                  {formatAmount(refundAmountMajor)}
                </span>
              </>
            ) : null}
            {refundedCopy ? (
              <span className="vt-confirmation__refund-copy" data-confirmation-refund-copy>
                {refundedCopy}
              </span>
            ) : null}
          </ReceiptRow>
        ) : null}
      </dl>
      {cancelSlot || showReview ? (
        <div className="vt-confirmation__voucher-slot" data-noprint="1">
          {showReview ? (
            <Button href={reviewHref} variant="primary" size="md">
              {t("reviewTrip")}
            </Button>
          ) : null}
          {cancelSlot}
        </div>
      ) : null}
    </Card>
  );
}
