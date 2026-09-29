"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";
import {
  fetchQuote,
  keepSelection,
  parseQuoteJson,
  tripIsQuotable,
  type QuoteOk,
  type QuoteRefusal,
  type QuoteResult,
} from "@/lib/checkout/checkout-quote";
import { formatChfRappen } from "@/lib/fx/format";
import { useFx } from "@/lib/fx/use-fx";
import { useVamosLocale } from "@/lib/locale-shim";
import { geoLocale } from "@/lib/checkout/geo-locale";
import { buildTripQuery, type Trip, type TripFieldError } from "@/lib/checkout/trip-url";
import { useCheckoutSettings } from "./CheckoutSettings";
import { ClassSection, type ClassPhase } from "./sections/ClassSection";
import { CheckoutFormProvider } from "./CheckoutForm";
import { ContactSection } from "./sections/ContactSection";
import { PaymentSection, TopNotice } from "./sections/PaymentSection";
import { PayBottomBar, SummaryRail, useIsDesktop } from "./sections/SummaryRail";
import { TripEditor } from "./sections/TripEditor";
import { TripStrip } from "./sections/TripStrip";

const { useRouter } = createNavigation(routing);

/** What sections 2 and 3, the rail and the pay bar (plan 19) read from the page. */
export type CheckoutFlow = {
  locale: string;
  trip: Trip;
  quote: QuoteOk | null;
  phase: ClassPhase;
  selectedClass: string | null;
  setSelectedClass: (slug: string | null) => void;
  /** Section 1 shows "Choose a class" under its title (set by PAY validation). */
  setClassError: (on: boolean) => void;
  /** Pricing is closed: PAY stays disabled. */
  pricingNotLive: boolean;
  editorOpen: boolean;
  openEditor: () => void;
  closeEditor: () => void;
  /** The booking to supersede when a later intent is made after Back from Stripe. */
  resumeBookingId: string | null;
  setResumeBookingId: (id: string | null) => void;
  /** `resume=` is in the URL and the trip is not: the resume flow supplies it. */
  resuming: boolean;
  /** Replace the trip (URL and quote) — the resume flow and SEE CURRENT PRICES use it. */
  applyTrip: (next: Trip, token?: string | null) => Promise<QuoteResult>;
  /**
   * A flight-only change: re-sign the lock through /api/quote/reprice. No loading phase,
   * no Turnstile, no price move. Falls back to applyTrip when the server answers anything else.
   */
  resignFlight: (next: Trip) => Promise<QuoteResult>;
  /** The lock last re-signed for a flight edit: its price call runs silently. */
  silentLock: MutableRefObject<string | null>;
  /** The editor holds changes that are not applied yet (PAY names it, D-17). */
  editorDirty: MutableRefObject<boolean>;
  /** `resume=` could not refill the page (no cookie, booking purged): open the editor. */
  resumeFailed: () => void;
  money: (rappen: number | null) => string;
};

const FlowContext = createContext<CheckoutFlow | null>(null);

export function useCheckoutFlow(): CheckoutFlow {
  const value = useContext(FlowContext);
  if (!value) throw new Error("useCheckoutFlow requires CheckoutPage");
  return value;
}

function toPhase(result: QuoteResult): ClassPhase {
  if (result.kind === "error") return { kind: "error", refusal: result };
  if (result.noneFit) return { kind: "empty" };
  return {
    kind: "ready",
    classes: result.classes,
    pricingNotLive: !result.pricingLive || result.classes.every((c) => c.totalRappen === null),
  };
}

function replaceUrl(trip: Trip): void {
  const qs = buildTripQuery(trip);
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
}

/**
 * The one-page checkout root (D-01). The trip comes from the URL (D-05); the page
 * quotes it through POST /api/quote with Search Box retrieve kinds, so the airport fee
 * and every guard run on the server (T-26.3-15-02/03). No server-side quote.
 */
export function CheckoutPage({
  initialTrip,
  errors,
  locale,
}: {
  initialTrip: Trip;
  errors: TripFieldError[];
  locale: string;
}) {
  const router = useRouter();
  const { cur } = useVamosLocale();
  const fx = useFx();
  const settings = useCheckoutSettings();

  const quotable = tripIsQuotable(initialTrip);
  const resuming = !quotable && Boolean(initialTrip.resume);

  const [trip, setTrip] = useState<Trip>(initialTrip);
  const [quote, setQuote] = useState<QuoteOk | null>(null);
  const [phase, setPhase] = useState<ClassPhase>(quotable || resuming ? { kind: "loading" } : { kind: "idle" });
  const [selected, setSelectedState] = useState<string | null>(null);
  const [classError, setClassError] = useState(false);
  const [editorOpen, setEditorOpen] = useState(!quotable && !resuming);
  const [resumeBookingId, setResumeBookingId] = useState<string | null>(null);

  const selectedRef = useRef<string | null>(null);
  const phaseRef = useRef<ClassPhase>(phase);
  const tripRef = useRef<Trip>(initialTrip);
  const editRef = useRef<HTMLButtonElement>(null);
  const started = useRef(false);
  const seq = useRef(0);
  const editorDirty = useRef(false);
  const quoteRef = useRef<QuoteOk | null>(null);
  const silentLock = useRef<string | null>(null);
  phaseRef.current = phase;
  quoteRef.current = quote;
  tripRef.current = trip;

  const money = useCallback(
    (rappen: number | null) => formatChfRappen(rappen, cur, fx.rates?.rates ?? null),
    [cur, fx.rates],
  );

  const setSelected = useCallback((slug: string | null) => {
    selectedRef.current = slug;
    setSelectedState(slug);
    if (slug) setClassError(false);
  }, []);

  /** Run one quote for `next`; only the newest call may write state. */
  const runQuote = useCallback(
    async (next: Trip, token?: string | null): Promise<QuoteResult> => {
      const mine = ++seq.current;
      const result = await fetchQuote(fetch, next, {
        locale: geoLocale(locale),
        currency: cur === "EUR" || cur === "USD" || cur === "AED" ? cur : "CHF",
        turnstileToken: token ?? null,
      });
      if (mine !== seq.current) return result;
      if (result.kind === "ok") {
        setQuote(result);
        setSelected(keepSelection(selectedRef.current ?? next.class, result.classes));
      } else {
        setQuote(null);
      }
      setPhase(toPhase(result));
      return result;
    },
    [locale, cur, setSelected],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (quotable) void runQuote(initialTrip);
    // The trip in the URL is read once; later changes go through applyTrip.
  }, []);

  const applyTrip = useCallback(
    async (next: Trip, token?: string | null): Promise<QuoteResult> => {
      const before = phaseRef.current;
      setPhase({ kind: "loading" });
      const result = await runQuote(next, token);
      if (result.kind === "ok") {
        setTrip(next);
        replaceUrl({ ...next, class: selectedRef.current });
      } else {
        // The previous trip and prices stay untouched (UI-SPEC S2 error state). A first
        // quote that fails (resume without a trip) keeps its error instead.
        if (before.kind !== "loading") setPhase(before);
      }
      return result;
    },
    [runQuote],
  );

  const resignFlight = useCallback(
    async (next: Trip): Promise<QuoteResult> => {
      const cur0 = quoteRef.current;
      const slug = selectedRef.current;
      if (!cur0) return applyTrip(next);
      const shown = slug ? cur0.classes.find((c) => c.slug === slug)?.totalRappen : undefined;
      try {
        const res = await fetch("/api/quote/reprice", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            quote_id: cur0.quoteId,
            lock: cur0.lock,
            locale: geoLocale(locale),
            display_currency: cur === "EUR" || cur === "USD" || cur === "AED" ? cur : "CHF",
            ...(slug ? { preferred_class: slug } : {}),
            legs: [{ leg_seq: 1, flight_no: next.flight ?? null }],
          }),
        });
        const result = parseQuoteJson(res.status, await res.json());
        const now = slug && result.kind === "ok" ? result.classes.find((c) => c.slug === slug)?.totalRappen : undefined;
        if (result.kind === "ok" && (shown === undefined || now === shown)) {
          silentLock.current = result.lock;
          setQuote(result);
          setTrip(next);
          replaceUrl({ ...next, class: slug });
          return result;
        }
      } catch {
        // fall through to the normal requote
      }
      return applyTrip(next);
    },
    [applyTrip, locale, cur],
  );

  const onEditorDirty = useCallback((dirty: boolean) => {
    editorDirty.current = dirty;
  }, []);

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    window.setTimeout(() => editRef.current?.focus(), 0);
  }, []);

  async function submitEditor(next: Trip, token?: string | null): Promise<QuoteRefusal | null> {
    const cur1 = tripRef.current;
    const flightOnly =
      !token &&
      (next.flight ?? null) !== (cur1.flight ?? null) &&
      next.from === cur1.from &&
      next.to === cur1.to &&
      next.fid === cur1.fid &&
      next.tid === cur1.tid &&
      next.when === cur1.when &&
      next.pax === cur1.pax &&
      next.bags === cur1.bags;
    const target = { ...next, class: selectedRef.current };
    const result = flightOnly ? await resignFlight(target) : await applyTrip(target, token);
    if (result.kind === "ok") {
      closeEditor();
      return null;
    }
    return result;
  }

  function choose(slug: string) {
    setSelected(slug);
    const next = { ...tripRef.current, class: slug };
    setTrip(next);
    replaceUrl(next);
  }

  const tripReady = tripIsQuotable(trip);
  const flow: CheckoutFlow = useMemo(
    () => ({
      locale,
      trip,
      quote,
      phase,
      selectedClass: selected,
      setSelectedClass: (slug) => (slug ? choose(slug) : setSelected(null)),
      setClassError,
      pricingNotLive: phase.kind === "error" ? phase.refusal.pricingNotLive : phase.kind === "ready" && phase.pricingNotLive,
      editorOpen,
      openEditor: () => setEditorOpen(true),
      closeEditor,
      resumeBookingId,
      setResumeBookingId,
      resuming,
      applyTrip,
      resignFlight,
      silentLock,
      editorDirty,
      resumeFailed: () => {
        setPhase({ kind: "idle" });
        setEditorOpen(true);
      },
      money,
    }),
    // choose() reads refs only
    [locale, trip, quote, phase, selected, editorOpen, resumeBookingId, resuming, applyTrip, resignFlight, money, closeEditor],
  );
  const desktop = useIsDesktop();

  return (
    <FlowContext.Provider value={flow}>
      <div className="vt-co" data-checkout-page>
        <div className="vt-co__top">
          {editorOpen ? (
            <TripEditor
              trip={trip}
              locale={locale}
              initialErrors={tripReady ? [] : errors}
              onSubmit={submitEditor}
              onClose={closeEditor}
              onDirtyChange={onEditorDirty}
            />
          ) : (
            <TripStrip
              trip={trip}
              locale={locale}
              onBack={() => router.push("/")}
              onEdit={() => setEditorOpen(true)}
              editRef={editRef}
            />
          )}
        </div>

        <CheckoutFormProvider>
        <TopNotice />
        <div className="vt-co__grid">
          <div className="vt-co__main">
            <ClassSection
              phase={phase}
              selected={selected}
              showError={classError}
              money={money}
              siteKey={settings.turnstileSiteKey}
              onChallengeToken={(token) => {
                if (token) void runQuote(tripRef.current, token);
              }}
              onSelect={choose}
              onRetry={() => {
                setPhase({ kind: "loading" });
                void runQuote(tripRef.current);
              }}
              onEditTrip={() => setEditorOpen(true)}
            />
            <ContactSection />
            <PaymentSection desktop={desktop} />
          </div>
          {desktop ? <SummaryRail /> : null}
        </div>
        {desktop ? null : <PayBottomBar />}
        </CheckoutFormProvider>
      </div>
    </FlowContext.Provider>
  );
}
