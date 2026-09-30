"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/feedback/Alert";
import { PayBar } from "@/components/checkout/PayBar";
import { TurnstileWidget } from "@/components/forms/TurnstileWidget";
import { PriceSummary, RouteSummary, type PriceLine, type RouteMetaItem } from "@/components/transfer";
import { extraLabel } from "@/lib/checkout/extra-label";
import { kmFigure } from "@/lib/checkout/checkout-quote";
import { formatTripWhen } from "@/lib/checkout/trip-format";
import { useCheckoutSettings } from "../CheckoutSettings";
import { useCheckoutFlow } from "../CheckoutPage";
import { useCheckoutForm } from "../CheckoutForm";
import { TripDistance } from "./TripDistance";

const DESKTOP_QUERY = "(min-width: 1081px)";

/** >=1081 shows the rail, <=1080 the bottom bar: exactly one PAY is ever rendered. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(DESKTOP_QUERY);
      mq.addEventListener("change", notify);
      return () => mq.removeEventListener("change", notify);
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  );
}

/** The two legal lines, existing strings verbatim (owner, 2026-09-29). */
export function LegalLines() {
  const t = useTranslations("checkout");
  return (
    <div className="vt-co__legal" data-co-legal>
      <p>{t("by-continuing-you-accept-the-terms-and-the-cance")}</p>
      <p>{t("fixed-price-all-taxes-and-tolls-included-free-ca")}</p>
    </div>
  );
}

/** Route, trip facts and the server price. Rail on desktop, Section 3 on phone and tablet. */
export function OrderSummary() {
  const t = useTranslations("checkout");
  const flow = useCheckoutFlow();
  const f = useCheckoutForm();
  const { trip, quote, selectedClass, locale } = flow;

  const className = quote?.classes.find((c) => c.slug === selectedClass)?.name ?? null;
  const when = formatTripWhen(trip.when, locale);
  const km = flow.phase.kind === "ready" ? kmFigure(quote?.distanceM) : null;
  const meta: RouteMetaItem[] = [
    ...(km
      ? [
          {
            icon: "navigation" as const,
            label: <TripDistance km={km} className="vt-co__km" />,
          },
        ]
      : []),
    ...(when ? [{ icon: "calendar" as const, label: <span className="vt-dir-keep">{when}</span> }] : []),
    {
      icon: "users" as const,
      label: `${t("passengersCount", { n: trip.pax ?? 1 })} · ${t("bagsCount", { n: trip.bags ?? 0 })}`,
    },
    ...(className ? [{ icon: "car-front" as const, label: <span className="vt-dir-keep">{className}</span> }] : []),
    ...(trip.flightDisplay ? [{ icon: "plane-landing" as const, label: <span className="vt-dir-keep">{trip.flightDisplay}</span> }] : []),
  ];

  const p = f.price;
  const lines: PriceLine[] =
    p.kind === "ok"
      ? p.lines.map((line) => {
          const amount = f.displayAmount(line.amount_rappen).major;
          switch (line.kind) {
            case "fare":
              return { label: t("fareExVat"), amount };
            case "surcharge": {
              const names = (line.params as { names?: Record<string, string> }).names;
              return { label: `+ ${extraLabel(names, line.code ?? "", locale)}`, amount };
            }
            case "coupon":
              return { label: t("couponCode", { code: line.code ?? "" }), amount, credit: true as const };
            default: {
              const bps = Number((line.params as { vatRateBps?: number }).vatRateBps);
              const rate = Number.isFinite(bps) ? String(Number((bps / 100).toFixed(2))) : "";
              return { label: rate ? t("receiptVat", { rate }) : t("receiptVatPlain"), amount };
            }
          }
        })
      : [];
  const currency = p.kind === "ok" ? f.displayAmount(p.chargedRappen).currency : undefined;

  return (
    <div className="vt-co__summary" data-co-summary>
      <RouteSummary
        pickup={<span dir="auto">{trip.from}</span>}
        dropoff={<span dir="auto">{trip.to}</span>}
        meta={meta}
      />
      <div data-co-price>
        {flow.pricingNotLive ? (
          <PriceSummary total={null} totalLabel={t("total")} />
        ) : !selectedClass || flow.phase.kind !== "ready" ? (
          <PriceSummary empty emptyMessage={flow.phase.kind === "loading" ? t("gettingPrices") : t("chooseClass")} />
        ) : p.kind === "ok" ? (
          <PriceSummary
            lines={lines}
            total={f.displayAmount(p.chargedRappen).major}
            currency={currency}
            totalLabel={t("total")}
          />
        ) : p.kind === "error" ? (
          <PriceSummary error={t("tryAgain")} />
        ) : (
          <PriceSummary loading loadingLabel={t("updatingPrice")} />
        )}
      </div>
    </div>
  );
}

/** Shared by the rail and the bar: the props of the one PAY. */
function usePay(variant: "bar" | "rail") {
  const t = useTranslations("checkout");
  const f = useCheckoutForm();
  const settings = useCheckoutSettings();
  const state = f.paying ? "loading" : f.payDisabled ? "disabled" : f.payError ? "error" : "idle";

  const challenge = f.challenge ? (
    <div className="vt-co__challenge-block" data-co-page-challenge>
      <Alert tone="info">{f.challengeText}</Alert>
      <TurnstileWidget siteKey={settings.turnstileSiteKey} action="checkout" onToken={f.submitChallengeToken} />
    </div>
  ) : null;

  return {
    variant,
    state,
    totalLabel: t("total"),
    total: f.totalView.total,
    totalNote: f.totalView.note,
    payLabel: t("pay"),
    payAmount: f.totalView.total,
    loadingLabel: t("openingPayment"),
    error: f.payError,
    liveMessage: f.liveMessage,
    challenge,
    onPay: f.pay,
  } as const;
}

/** >=1081: sticky right rail, 360px, top 96px. */
export function SummaryRail() {
  const t = useTranslations("checkout");
  const props = usePay("rail");
  return (
    <aside className="vt-co__rail" data-co-rail>
      <div className="vt-co__railcard">
        <OrderSummary />
        <LegalLines />
        <PayBar {...props} reassurance={t("reassurance")} />
      </div>
    </aside>
  );
}

/** <=1080: sticky bottom bar. "Total" scrolls to Section 3's summary. */
export function PayBottomBar() {
  const props = usePay("bar");
  return (
    <div className="vt-co__bar" data-co-bar>
      <PayBar
        {...props}
        onTotal={() => {
          const el = document.querySelector("#co-summary");
          const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          el?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
        }}
      />
    </div>
  );
}
