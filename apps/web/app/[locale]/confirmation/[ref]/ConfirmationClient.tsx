"use client";

// D-16: this component performs no write and does not confirm a booking.
// TWINT and 3DS may never return to this tab — the poller is the only
// observer, and it is read-only.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/feedback/Alert";
import { Button, Card, CheckerMark, Logo } from "@/components/core";
import { PriceSummary, RouteSummary, StatusBadge } from "@/components/transfer";
import { useBookingDraft } from "@/lib/booking-draft";
import { PHONE_DISPLAY, PHONE_HREF, WHATSAPP_HREF } from "@/lib/contact-channels";
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
  extras?: import("@vamos/emails/confirmation").PayLinkExtraCode[];
  vehicleClassSlug?: string;
  priceTotalRappen?: number | null;
  fareLines?: import("@/lib/checkout/booking-read").ConfirmationFareLine[];
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
  const pax = booking && booking.pax > 0 ? booking.pax : draft.passengers;
  const extras = booking?.extras ?? [];
  const extraLabel: Record<string, "childSeat" | "extraOversized" | "additional-stop-2"> = {
    child_seat: "childSeat",
    oversized_luggage: "extraOversized",
    extra_stop: "additional-stop-2",
  };

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
  const totalRappen = booking?.priceTotalRappen;
  const totalMajor =
    totalRappen != null && Number.isFinite(totalRappen) ? totalRappen / 100 : null;
  const fareLines = Array.isArray(booking?.fareLines) ? booking.fareLines : [];
  const chargedLines = fareLines
    .filter((line) => line.code === "distance_fare" && Number.isFinite(line.amountRappen))
    .map((line) => {
      const slug = (line.vehicleClass || classSlug).trim();
      const cls =
        slug === "economy"
          ? tCommon("vehicleClassEconomy")
          : slug === "business"
            ? tCommon("vehicleClassBusiness")
            : slug === "van"
              ? tCommon("vehicleClassVan")
              : slug
                ? tCommon("vehicleClassOf", { class: slug })
                : vehicleLabel;
      return { label: t("transferClass", { class: cls }), amount: line.amountRappen / 100 };
    });
  const lines =
    chargedLines.length > 0
      ? chargedLines
      : [{ label: t("transferClass", { class: vehicleLabel }), amount: totalMajor }];

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
          <p className="vt-confirmation__voucher-title">{t("transferVoucher")}</p>
          <StatusBadge status="confirmed" />
        </div>
        <RouteSummary
          inverse
          pickup={pickup}
          dropoff={dropoff}
          meta={[
            { icon: "calendar", label: <span className="vt-dir-keep">{scheduled.date}</span> },
            {
              icon: "clock",
              label: (
                <span className="vt-dir-keep">
                  {t("pickupAt", { time: scheduled.time || scheduled.date })}
                </span>
              ),
            },
            { icon: "users", label: t("passengersCount", { n: pax }) },
            { icon: "car", label: vehicleLabel },
            ...extras.map((code) => ({
              icon: (code === "oversized_luggage"
                ? "luggage"
                : code === "extra_stop"
                  ? "map-pin"
                  : "baby") as "baby" | "luggage" | "map-pin",
              label: (
                <span data-confirmation-extra={code}>{t(extraLabel[code] ?? "childSeat")}</span>
              ),
            })),
          ]}
        />
        <PriceSummary
          inverse
          lines={lines}
          total={totalMajor}
          totalLabel={t("paid")}
          note={totalMajor == null ? t("pricePlaceholderNote") : undefined}
        />
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
