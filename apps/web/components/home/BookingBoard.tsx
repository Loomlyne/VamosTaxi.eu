"use client";

// Composition of Phase 4's contract into BookingCardMount's three slots.
// No component /dev/quote has not already rendered. Amounts go through
// formatAmount; CHF 000 appears because the data is null.

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createTranslator, useLocale, useMessages } from "next-intl";
import { Icon } from "@/components/core";
import { Alert, Toast } from "@/components/feedback";
import type { AlertTone } from "@/components/feedback";
import { Counter, DatePicker, Input } from "@/components/forms";
import { PriceSummary, VehicleCard } from "@/components/transfer";
import type { PriceLine } from "@/components/transfer";
import type { CurrencyCode } from "@/lib/currency";
import { useCurrency } from "@/lib/currency-store";
import { useBookingDraft } from "@/lib/booking-draft";
import { chfRappenToDisplay, formatChfRappen } from "@/lib/fx/format";
import { useFx } from "@/lib/fx/use-fx";
import type { ClassBoardEntry, VehicleClassSlug } from "@/lib/pricing/types";
import {
  DIR_KEEP_PARAMS,
  LOCK_DANGER_THRESHOLD_S,
  REFUSAL_BINDINGS,
  type Binding,
  type QuoteErrorCode,
  type QuoteResponse,
  type RefusalTone,
} from "@/lib/quote/client-contract";
import { BookingCardMount } from "./BookingCardMount";
import "./BookingBoard.css";

const CLASS_NAMES: Record<VehicleClassSlug, string> = {
  economy: "Economy",
  business: "Business",
  first: "First",
  van: "Van",
};

const DIR_KEEP = new Set<string>(DIR_KEEP_PARAMS);

type ErrorBody = {
  ok: false;
  error: QuoteErrorCode;
  i18n_key: string;
  params?: Record<string, string | number | null>;
};

type StatusKind = "none_fit" | "moved_to" | "saved" | "ready" | "needs-a-trip";

type MovedTo = { v: VehicleClassSlug; from: VehicleClassSlug; cap: number };

function lookupMessage(messages: unknown, key: string): string {
  const parts = key.split(".");
  function walk(node: unknown, segs: string[]): unknown {
    if (!node || typeof node !== "object" || segs.length === 0) return undefined;
    const rec = node as Record<string, unknown>;
    const rest = segs.join(".");
    if (rest in rec && typeof rec[rest] === "string") return rec[rest];
    const head = segs[0];
    if (head === undefined) return undefined;
    if (head in rec) return walk(rec[head], segs.slice(1));
    return undefined;
  }
  const found = walk(messages, parts);
  return typeof found === "string" ? found : "";
}

function useLabel() {
  const locale = useLocale();
  const messages = useMessages();
  return (key: string, values?: Record<string, string | number>) => {
    const raw = lookupMessage(messages, key);
    if (!raw) return "";
    if (!values) return raw;
    const t = createTranslator({ locale, messages: { _msg: raw } });
    return t("_msg", values);
  };
}

function mmss(totalS: number): string {
  const clamped = Math.max(0, totalS);
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function keep(value: ReactNode): ReactNode {
  return <span className="vt-dir-keep">{value}</span>;
}

function className(slug: VehicleClassSlug): ReactNode {
  return keep(CLASS_NAMES[slug] ?? slug);
}

function alertTone(tone: RefusalTone): AlertTone {
  return tone === "danger" ? "danger" : "info";
}

function toastTone(tone: RefusalTone): "neutral" | "danger" {
  return tone === "neutral" ? "neutral" : "danger";
}

function isErrorBody(data: unknown): data is ErrorBody {
  if (!data || typeof data !== "object") return false;
  const rec = data as { ok?: unknown; error?: unknown };
  return rec.ok === false && typeof rec.error === "string" && rec.error in REFUSAL_BINDINGS;
}

function isQuoteOk(data: unknown): data is QuoteResponse {
  if (!data || typeof data !== "object") return false;
  const rec = data as { ok?: unknown; classes?: unknown };
  return rec.ok === true && Array.isArray(rec.classes);
}

function cheapestEligible(classes: ClassBoardEntry[]): ClassBoardEntry | null {
  return classes.find((entry) => entry.eligible) ?? null;
}

function ineligiblePrice(
  entry: ClassBoardEntry,
  label: (key: string, values?: Record<string, string | number>) => string,
): string {
  const reason = entry.ineligible_reason;
  if (reason === "pax") return label("quote.class.na_pax", { n: entry.effective_max_pax });
  if (reason === "bags") return label("quote.class.na_bags", { n: entry.max_bags });
  if (reason === "unavailable") return label("quote.class.unavailable");
  if (reason === "no_rate") return label("quote.class.no_rate");
  if (reason === "route_off") return label("quote.class.route_off");
  return "";
}

/** D-19: public amounts stay CHF 000 until Publish-as-flip. */
function publicRappen(
  pricingLive: boolean,
  rappen: number | null | undefined,
): number | null {
  return pricingLive ? rappen ?? null : null;
}

function linesFor(
  entry: ClassBoardEntry,
  label: (key: string, values?: Record<string, string | number>) => string,
  display: (rappen: number | null) => { major: number | null; currency: CurrencyCode },
): PriceLine[] {
  return entry.lines.map((line) => {
    const params = line.params as Record<string, string | number> | undefined;
    const rawParams = params
      ? Object.fromEntries(
          Object.entries(params).map(([key, value]) => [key, DIR_KEEP.has(key) ? String(value) : value]),
        )
      : undefined;
    const shown = display(line.amount_rappen);
    return {
      label: label(line.i18n_key, rawParams),
      amount: shown.major,
      credit: line.kind === "discount",
      muted: line.kind === "included",
    };
  });
}

function remainingSeconds(expiresAt: string, nowMs: number): number {
  const exp = Date.parse(expiresAt);
  if (Number.isNaN(exp)) return 0;
  return Math.max(0, Math.floor((exp - nowMs) / 1000));
}

function RefusalView({
  binding,
  text,
}: {
  binding: Binding;
  text: string;
}) {
  switch (binding.component) {
    case "Input":
      return binding.slot === "error" ? (
        <Input label={text} error={text} readOnly />
      ) : (
        <Input label={text} hint={text} readOnly />
      );
    case "Alert":
      return <Alert tone={alertTone(binding.tone)}>{text}</Alert>;
    case "DatePicker":
      return (
        <DatePicker
          label={text}
          error={text}
          placeholder=""
          prevMonthLabel=""
          nextMonthLabel=""
        />
      );
    case "PriceSummary":
      return binding.slot === "note" ? (
        <PriceSummary total={null} note={text} />
      ) : (
        <PriceSummary error={text} />
      );
    case "Toast":
      return <Toast tone={toastTone(binding.tone)}>{text}</Toast>;
    case "Counter":
      return (
        <Counter
          label={text}
          value={0}
          error={text}
          decrementLabel=""
          incrementLabel=""
        />
      );
    case "data-tok":
      return <span data-tok>{text}</span>;
    default: {
      const _exhaustive: never = binding.component;
      return _exhaustive;
    }
  }
}

function Countdown({ remainingS }: { remainingS: number }) {
  const danger = remainingS <= LOCK_DANGER_THRESHOLD_S;
  return (
    <div className="vt-bb-countdown" data-lock-state={danger ? "danger" : "normal"}>
      <Icon
        name="clock"
        size={15}
        color={danger ? "var(--vt-danger)" : "var(--vt-text-muted)"}
      />
      {keep(mmss(remainingS))}
    </div>
  );
}

function tripComplete(draft: { pickup: string; destination: string; date: string; time: string }): boolean {
  return Boolean(draft.pickup && draft.destination && draft.date && draft.time);
}

export function BookingBoard() {
  const locale = useLocale();
  const label = useLabel();
  const { currency } = useCurrency();
  const { rates, status: fxStatus } = useFx();
  const fxRates = rates?.rates ?? null;
  const [draft, writeDraft] = useBookingDraft();
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [refusal, setRefusal] = useState<ErrorBody | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<VehicleClassSlug | null>(null);
  const [movedTo, setMovedTo] = useState<MovedTo | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const complete = tripComplete(draft);

  useEffect(() => {
    const controller = new AbortController();
    if (!complete) {
      setQuote(null);
      setRefusal(null);
      setLoading(false);
      setMovedTo(null);
      return () => {
        controller.abort();
      };
    }

    const timer = window.setTimeout(() => {
      setLoading(true);
      const preferred = selectedRef.current;
      const body = {
        locale,
        display_currency: "CHF",
        mode: "one_way",
        pickup: { kind: "coords" as const, lng: 0, lat: 0, text: draft.pickup },
        dropoff: { kind: "coords" as const, lng: 0, lat: 0, text: draft.destination },
        legs: [
          {
            leg_seq: 1 as const,
            scheduled_local: `${draft.date}T${draft.time}`,
            flight_no: draft.flightNumber || null,
          },
        ],
        pax: draft.passengers,
        bags: draft.luggage,
        preferred_class: preferred ?? undefined,
      };

      void fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
        .then(async (res) => {
          const data: unknown = await res.json();
          if (isErrorBody(data)) {
            setRefusal(data);
            setQuote(null);
            setMovedTo(null);
            return;
          }
          if (!isQuoteOk(data)) {
            return;
          }
          const prev = selectedRef.current;
          setRefusal(null);
          setQuote(data);
          if (data.no_eligible_class) {
            setSelected(null);
            setMovedTo(null);
            return;
          }
          if (!prev) {
            setMovedTo(null);
            return;
          }
          const still = data.classes.find((entry) => entry.slug === prev && entry.eligible);
          if (still) {
            setMovedTo(null);
            return;
          }
          const nextFit = cheapestEligible(data.classes);
          if (nextFit) {
            setSelected(nextFit.slug);
            setMovedTo({
              v: nextFit.slug,
              from: prev,
              cap: nextFit.effective_max_pax,
            });
            return;
          }
          setSelected(null);
          setMovedTo(null);
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    complete,
    draft.pickup,
    draft.destination,
    draft.date,
    draft.time,
    draft.passengers,
    draft.luggage,
    draft.flightNumber,
    locale,
  ]);

  useEffect(() => {
    if (!quote?.expires_at) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [quote?.expires_at]);

  const selectedEntry = useMemo(() => {
    if (!quote) return null;
    if (selected) {
      return quote.classes.find((entry) => entry.slug === selected) ?? null;
    }
    return cheapestEligible(quote.classes);
  }, [quote, selected]);

  useEffect(() => {
    if (!quote || !selectedEntry) return;
    writeDraft({
      quoteId: quote.quote_id,
      lock: quote.lock,
      vehicleClass: selectedEntry.slug,
      chargedRappen: selectedEntry.total_rappen ?? undefined,
    });
  }, [quote, selectedEntry, writeDraft]);

  const statusKind: StatusKind = (() => {
    if (quote?.no_eligible_class) return "none_fit";
    if (movedTo) return "moved_to";
    if (selected) return "saved";
    if (quote) return "ready";
    return "needs-a-trip";
  })();

  const statusText = (() => {
    switch (statusKind) {
      case "none_fit":
        return label("quote.none_fit");
      case "moved_to":
        return movedTo
          ? label("quote.moved_to", {
              v: CLASS_NAMES[movedTo.v] ?? movedTo.v,
              from: CLASS_NAMES[movedTo.from] ?? movedTo.from,
              cap: movedTo.cap,
            })
          : "";
      case "saved":
        return label("quote.class.select_hint");
      case "ready":
        return label("quote.class.select_hint");
      case "needs-a-trip":
        return label("quote.empty.subtitle");
      default: {
        const _exhaustive: never = statusKind;
        return _exhaustive;
      }
    }
  })();

  const remainingS = quote?.expires_at ? remainingSeconds(quote.expires_at, nowMs) : 0;

  const refusalBinding = refusal ? REFUSAL_BINDINGS[refusal.error] : null;
  const refusalText = refusal
    ? label(
        refusalBinding?.i18n_key ?? refusal.i18n_key,
        (refusal.params ?? undefined) as Record<string, string | number> | undefined,
      )
    : "";
  const refusalNode =
    refusal && refusalBinding ? (
      <div
        data-refusal-code={refusal.error}
        data-refusal-placement={refusalBinding.placement}
      >
        <RefusalView binding={refusalBinding} text={refusalText} />
      </div>
    ) : null;

  const boardRefusal =
    refusalBinding &&
    (refusalBinding.placement === "board-level" ||
      refusalBinding.placement === "inline" ||
      refusalBinding.placement === "near-field" ||
      refusalBinding.placement === "transient")
      ? refusalNode
      : null;

  const priceRefusal =
    refusalBinding && refusalBinding.placement === "sticky-price-panel" ? refusalNode : null;

  const board = (
    <div data-bc-board-list="">
      {boardRefusal}
      {quote
        ? quote.classes.map((entry) => {
            const eligible = entry.eligible;
            const price = eligible
              ? keep(
                  formatChfRappen(
                    publicRappen(quote.pricing_live, entry.total_rappen),
                    currency,
                    fxRates,
                  ),
                )
              : ineligiblePrice(entry, label);
            return (
              <VehicleCard
                key={entry.slug}
                name={className(entry.slug)}
                price={price}
                priceNote={eligible ? label("quote.class.price_note") : undefined}
                passengers={entry.effective_max_pax}
                luggage={entry.max_bags}
                badge={entry.fixed_route ? label("quote.class.fixed_route_badge") : undefined}
                disabled={!eligible}
                loading={loading}
                selected={selected === entry.slug}
                onSelect={() => {
                  setSelected(entry.slug);
                  setMovedTo(null);
                }}
              />
            );
          })
        : null}
    </div>
  );

  const pricingNote =
    selectedEntry && selectedEntry.total_rappen == null
      ? label(REFUSAL_BINDINGS.pricing_not_live.i18n_key)
      : undefined;

  const price = (
    <div data-bc-price-stack="">
      {priceRefusal}
      {loading && !quote ? (
        <PriceSummary loading loadingLabel={label("quote.loading")} />
      ) : selectedEntry && quote && !refusal ? (
        <>
          <PriceSummary
            lines={linesFor(selectedEntry, label, (rappen) =>
              chfRappenToDisplay(
                publicRappen(quote.pricing_live, rappen),
                currency,
                fxRates,
              ),
            )}
            total={
              chfRappenToDisplay(
                publicRappen(quote.pricing_live, selectedEntry.total_rappen),
                currency,
                fxRates,
              ).major
            }
            currency={
              chfRappenToDisplay(
                publicRappen(quote.pricing_live, selectedEntry.total_rappen),
                currency,
                fxRates,
              ).currency
            }
            totalLabel={label("price.line.total")}
            note={
              pricingNote ??
              (currency !== "CHF" && fxStatus === "down"
                ? label("checkout.fxUnavailable")
                : undefined)
            }
          />
          {quote.expires_at ? <Countdown remainingS={remainingS} /> : null}
          {quote.coupon?.code ? keep(quote.coupon.code) : null}
          {draft.flightNumber ? keep(draft.flightNumber) : null}
        </>
      ) : !refusal ? (
        <PriceSummary empty emptyMessage={label("quote.empty.subtitle")} />
      ) : null}
    </div>
  );

  const status = (
    <span data-status-kind={statusKind}>
      {statusKind === "none_fit" || statusKind === "moved_to" ? keep(statusText) : statusText}
    </span>
  );

  return <BookingCardMount board={board} price={price} status={status} />;
}
