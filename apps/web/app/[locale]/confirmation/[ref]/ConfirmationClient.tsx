"use client";

// D-16: this component performs no write and does not confirm a booking.
// TWINT and 3DS may never return to this tab — the poller is the only
// observer, and it is read-only.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Alert } from "@/components/feedback/Alert";
import { Dialog } from "@/components/feedback/Dialog";
import { Button, Card, Icon } from "@/components/core";
import { StatusBadge } from "@/components/transfer";
import { BookingVoucher, type BookingVoucherFacts } from "@/components/booking/BookingVoucher";
import { useBookingDraft } from "@/lib/booking-draft";
import { PHONE_DISPLAY, PHONE_HREF, WHATSAPP_HREF } from "@/lib/contact-channels";
import {
  isCapturedPayment,
  isFailedPayment,
  isFailedStatus,
  isVoucherStatus,
} from "@/lib/checkout/booking-status";
import { voucherBadgeStatus, voucherNeedsPayment } from "@/lib/checkout/voucher-badge";
import { customerCancelWindow } from "@/lib/checkout/cancel-window";

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

export type ConfirmationFacts = BookingVoucherFacts & {
  reference: string;
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

function pollOutcome(json: unknown): "confirmed" | "failed" | "wait" {
  if (!json || typeof json !== "object") return "wait";
  if ("visible" in json && (json as { visible: unknown }).visible === false) return "wait";
  const status = asStringField(json, "status");
  const paymentStatus = asStringField(json, "paymentStatus");
  if (isVoucherStatus(status) || isCapturedPayment(paymentStatus)) return "confirmed";
  if (isFailedPayment(paymentStatus) || isFailedStatus(status)) return "failed";
  return "wait";
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

function FailedRoom({ reference }: { reference: string }) {
  const t = useTranslations("checkout");
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
        <HelpRow />
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
  // 26.1-16 (D-22): the return route adds charge=refunded when this payer's
  // charge lost the race and was refunded. Display hint only.
  const chargeRefunded = useSearchParams()?.get("charge") === "refunded";
  const [phase, setPhase] = useState<ConfirmationPhase>(initialPhase);
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
  const waiting = phase === "processing" || phase === "give-up";

  useEffect(() => {
    setLiveStatus(booking?.status ?? "");
    setLivePayment(booking?.paymentStatus ?? null);
  }, [booking?.status, booking?.paymentStatus]);

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
          if (json && typeof json === "object") {
            const nextStatus = asStringField(json, "status");
            const nextPayment = asStringField(json, "paymentStatus");
            if (nextStatus) setLiveStatus(nextStatus);
            if (nextPayment) setLivePayment(nextPayment);
          }
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

  if (phase === "failed" && !isFailedStatus(liveStatus || booking?.status || "")) {
    return <FailedRoom reference={reference} />;
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
  const pageState = waiting && badge !== "paid" && badge !== "confirmed" ? "processing" : badge;
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

      <div className="vt-confirmation__actions">
        {unpaid ? (
          <Button icon="credit-card" href={`/${locale}/checkout/payment`}>
            {t("finishPayment")}
          </Button>
        ) : (
          <Button icon="printer" variant="secondary" onClick={() => window.print()}>
            {t("download-voucher")}
          </Button>
        )}
        {showConfirmedChrome ? (
          <Button icon="calendar-days" variant="ghost" href={`/api/checkout/invite/${encodeURIComponent(reference)}`}>
            {t("add-to-calendar")}
          </Button>
        ) : null}
        <Button icon="pencil" variant="ghost" href={`/${locale}/manage-booking`}>
          {t("manageBooking")}
        </Button>
        {showConfirmedChrome ? (
          <Button icon="mail" variant="ghost" disabled title={t("resendEmailSoon")}>
            {t("resendEmail")}
          </Button>
        ) : null}
      </div>

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

      <div className="vt-confirmation__footer">
        <Button variant="ghost" iconEnd="arrow-right" href={`/${locale}`}>
          {t("book-another-transfer")}
        </Button>
      </div>
    </main>
  );
}
