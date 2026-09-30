"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@/components/feedback/Alert";
import { Button, Icon } from "@/components/core";
import { VehicleCard } from "@/components/transfer";
import { TurnstileWidget } from "@/components/forms/TurnstileWidget";
import type { ClassView, QuoteRefusal } from "@/lib/checkout/checkout-quote";
import { useQuoteLabel } from "@/lib/checkout/quote-label";
import { SectionCard } from "./SectionCard";

export type ClassPhase =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; refusal: QuoteRefusal }
  | { kind: "empty" }
  | { kind: "ready"; classes: ClassView[]; pricingNotLive: boolean };

/**
 * Section 1 — Choose your class. Cards: Economy / Business / Van luxury (names come
 * from the price book, Latin in every language). States: loading, quote error, pricing
 * not live, empty ("No class fits this trip"), too small (disabled with a note), selected.
 */
export function ClassSection({
  phase,
  selected,
  showError,
  money,
  siteKey,
  onChallengeToken,
  onSelect,
  onRetry,
  onEditTrip,
}: {
  phase: ClassPhase;
  selected: string | null;
  /** PAY was pressed with no class: "Choose a class" under the title. */
  showError: boolean;
  /** Formats CHF rappen (or null -> `CHF 000`) in the display currency. */
  money: (rappen: number | null) => string;
  siteKey: string | undefined;
  onChallengeToken: (token: string | null) => void;
  onSelect: (slug: string) => void;
  onRetry: () => void;
  onEditTrip: () => void;
}) {
  const t = useTranslations("checkout");
  const label = useQuoteLabel();

  const note = (c: ClassView): string => {
    if (c.eligible) return t("fixedPrice");
    if (c.block === "pax") return t("seatsUpTo", { n: c.pax });
    if (c.block === "bags") return t("takesUpToBags", { n: c.bags });
    if (c.block === "no_rate") return label("quote.class.no_rate");
    if (c.block === "route_off") return label("quote.class.route_off");
    return label("quote.class.unavailable");
  };

  const done = phase.kind === "ready" && selected !== null;
  const body = (() => {
    if (phase.kind === "idle") {
      return (
        <p className="vt-co__loading" data-co-classes-idle>
          {t("tripMissing")}
        </p>
      );
    }
    if (phase.kind === "loading") {
      return (
        <div data-co-classes-loading aria-busy="true">
          <p className="vt-co__loading" role="status">
            {t("gettingPrices")}
          </p>
          <div className="vt-co__classes" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <VehicleCard key={i} name="" loading />
            ))}
          </div>
        </div>
      );
    }
    if (phase.kind === "error") {
      const r = phase.refusal;
      const text = r.pricingNotLive
        ? label("quote.error.pricing_not_live")
        : (r.i18nKey ? label(r.i18nKey, r.params ?? undefined) : "") || t("quoteGeneric");
      return (
        <div className="vt-co__stack" data-co-classes-error data-co-error-code={r.code}>
          <Alert tone={r.pricingNotLive ? "info" : "danger"} role="alert">
            {text}
          </Alert>
          {r.challenge ? (
            <div className="vt-co__challenge">
              <TurnstileWidget siteKey={siteKey} action="checkout" onToken={onChallengeToken} />
            </div>
          ) : null}
          {!r.pricingNotLive ? (
            <div>
              <Button variant="secondary" size="md" onClick={onRetry} data-co-retry>
                {t("tryAgain")}
              </Button>
            </div>
          ) : null}
        </div>
      );
    }
    if (phase.kind === "empty") {
      return (
        <div className="vt-co__stack" data-co-classes-empty>
          <h3 className="vt-co__empty-title">{t("emptyTitle")}</h3>
          <p className="vt-co__empty-body">{t("emptyBody")}</p>
          <div>
            <Button variant="secondary" size="md" onClick={onEditTrip} data-co-empty-edit>
              {t("editTrip")}
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="vt-co__stack">
        {phase.pricingNotLive ? (
          <Alert tone="info" data-co-pricing-not-live>
            {label("quote.error.pricing_not_live")}
          </Alert>
        ) : null}
        <div className="vt-co__classes" role="group" aria-label={t("chooseClassAria")} data-co-classes>
          {phase.classes.map((c) => {
            const isSelected = selected === c.slug;
            return (
              <div
                className="vt-co__class"
                key={c.slug}
                data-co-class={c.slug}
                data-eligible={c.eligible ? "true" : "false"}
                data-selected={isSelected ? "true" : "false"}
              >
                <VehicleCard
                  name={<span className="vt-dir-keep">{c.name}</span>}
                  price={money(c.totalRappen)}
                  priceNote={note(c)}
                  features={[
                    ...(c.pax ? [{ icon: "users" as const, label: t("classSeats", { n: c.pax }) }] : []),
                    ...(c.bags ? [{ icon: "luggage" as const, label: t("classBags", { n: c.bags }) }] : []),
                  ]}
                  image={c.photo || undefined}
                  imageAlt={c.name}
                  icon="car"
                  selected={isSelected}
                  disabled={!c.eligible}
                  onSelect={() => onSelect(c.slug)}
                />
                {isSelected ? (
                  <span className="vt-co__class-check" aria-hidden="true">
                    <Icon name="check" size={14} color="var(--vt-accent)" />
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  })();

  return (
    <SectionCard
      n={1}
      title={t("sectionClass")}
      done={done}
      error={showError && !done ? t("chooseClass") : null}
      id="co-section-class"
    >
      {body}
    </SectionCard>
  );
}
