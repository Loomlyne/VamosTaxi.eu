"use client";

// D-16: this component performs no write and does not confirm a booking.
// TWINT and 3DS may never return to this tab — the poller is the only
// observer, and it is read-only.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/feedback/Alert";
import { Button, Card, CheckerMark, Icon, Logo } from "@/components/core";
import { PriceSummary, RouteSummary, StatusBadge } from "@/components/transfer";
import { useBookingDraft } from "@/lib/booking-draft";
import { PHONE_DISPLAY } from "@/lib/contact-channels";
import { isVoucherStatus } from "@/lib/checkout/booking-status";

export type ConfirmationPhase = "hidden" | "processing" | "confirmed" | "give-up";

/**
 * First delay before the status GET. Short enough to feel live, long
 * enough not to stampede the Worker on every return.
 */
export const POLL_INTERVAL_MS = 2000;

/**
 * Cap for exponential backoff between GETs. Cloudflare Queues
 * `max_retries` for checkout-settle is 8; this cap keeps the browser
 * quieter than the consumer's retry storm without going idle.
 */
export const POLL_BACKOFF_MAX_MS = 8000;

/**
 * Give-up window. Queue `max_retries` is 8 and settlement continues
 * after the spinner stops; the copy tells the guest to wait for email
 * rather than sit on a four-minute spinner. 30s covers several poll
 * ticks plus a slow first hop.
 */
export const POLL_GIVE_UP_MS = 30_000;

export type ConfirmationFacts = {
  reference: string;
  pickupText: string;
  dropoffText: string;
  scheduledLocal: string;
  pax: number;
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

  useEffect(() => {
    if (phase !== "processing") return;
    let stopped = false;
    let timeoutId = 0;
    let delay = POLL_INTERVAL_MS;

    async function tick() {
      if (stopped) return;
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch(`/api/checkout/status/${encodeURIComponent(reference)}`, {
          cache: "no-store",
        });
        const json: unknown = await res.json();
        const status =
          json && typeof json === "object" && "status" in json && typeof (json as { status: unknown }).status === "string"
            ? (json as { status: string }).status
            : "";
        if (isVoucherStatus(status)) {
          setPhase("confirmed");
          return;
        }
      } catch {
        // Network blip — keep polling until the window closes.
      }
      delay = Math.min(delay * 2, POLL_BACKOFF_MAX_MS);
      timeoutId = window.setTimeout(tick, delay);
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
    timeoutId = window.setTimeout(tick, POLL_INTERVAL_MS);
    const giveUpId = window.setTimeout(() => {
      if (!stopped) setPhase("give-up");
    }, POLL_GIVE_UP_MS);
    return () => {
      stopped = true;
      window.clearTimeout(timeoutId);
      window.clearTimeout(giveUpId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [phase, reference]);

  const pickup = booking?.pickupText || draft.pickup;
  const dropoff = booking?.dropoffText || draft.destination;
  const scheduled = booking?.scheduledLocal
    ? wallTime(booking.scheduledLocal)
    : { date: draft.date, time: draft.time };
  const pax = booking?.pax || draft.passengers;
  const vehicleLabel = t("vehicleClassFallback");

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

  if (phase === "processing") {
    return (
      <main className="vt-confirmation" data-confirmation data-confirmation-state="processing">
        <div className="vt-confirmation__panel" data-confirmation-processing>
          <Icon name="loader-circle" size={28} className="vt-confirmation__spin" />
          <h1 className="vt-confirmation__title">{t("processingTitle")}</h1>
          <p className="vt-confirmation__lede">{t("processingBody")}</p>
        </div>
      </main>
    );
  }

  if (phase === "give-up") {
    return (
      <main className="vt-confirmation" data-confirmation data-confirmation-state="give-up">
        <div className="vt-confirmation__hero" data-confirmation-giveup>
          <h1 className="vt-confirmation__title">{t("giveUpTitle")}</h1>
          <p className="vt-confirmation__lede">{t("giveUpBody", { phone: PHONE_DISPLAY })}</p>
        </div>
      </main>
    );
  }

  const isAirport = /airport|zrh|gva/i.test(`${pickup} ${dropoff}`);
  const lines = [
    { label: t("transferClass", { class: vehicleLabel }), amount: null as number | null },
    ...(isAirport ? [{ label: tCommon("airport-pickup-fee"), amount: null as number | null }] : []),
    { label: t("paidBy", { method: t("card-apple-pay-or-twint") }), amount: null as number | null, muted: true },
  ];

  return (
    <main className="vt-confirmation" data-confirmation data-confirmation-state="confirmed">
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
          pickupDetail={t("arrivals-your-driver-waits-with-your-name")}
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
          ]}
        />
        <PriceSummary
          inverse
          lines={lines}
          total={null}
          totalLabel={t("paid")}
          note={t("pricePlaceholderNote")}
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
