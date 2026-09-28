"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createNavigation } from "next-intl/navigation";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/feedback/Alert";
import { Badge, Button, Card, Icon } from "@/components/core";
import { Counter, Input, Select, Textarea, WhenPicker, TimePicker } from "@/components/forms";
import { StepIndicator } from "@/components/navigation/StepIndicator";
import { Tabs } from "@/components/navigation/Tabs";
import { PriceSummary, RouteSummary, type RouteMetaItem } from "@/components/transfer";
import {
  ContactFields,
  FlightField,
  type ContactFieldsErrors,
  type ContactFieldsValue,
} from "@/components/booking";
import { PlaceCombo, type PlaceRetrieve } from "@/components/forms/PlaceCombo";
import { e164Phone, isCheckoutEmail } from "@/lib/checkout/contact-validate";
import { shouldPersistUnpaidBooking } from "@/lib/checkout/booking-lifecycle";
import { classIsSelectable, quoteUnpriced } from "@/lib/checkout/charge-gate";
import { readDraft, useBookingDraft } from "@/lib/booking-draft";
import {
  bouncePath,
  checkoutStepPath,
  checkoutWindowHours,
  hasQuoteLock,
  localePath,
  lockExpired,
  type CheckoutStep,
} from "@/lib/checkout/steps";
import {
  formatRailDate,
  formatDistanceKm,
  geoLocale,
  firstPricedLockSlug,
  peekLockClassRappen,
  peekLockClassTotals,
  peekLockDistanceM,
  peekLockExtras,
  placeMapboxId,
  placeText,
  readVamosTrip,
  tripBags,
  tripDropoff,
  tripPax,
  tripPickup,
  tripQuoteId,
  tripVehicle,
  writeVamosTrip,
  type VamosTrip,
} from "@/lib/checkout/vamos-trip";
import {
  airportPickupFromPlace,
  extraIsOn,
  extraRappenOutsideLock,
  extraUi,
  recapExtraFares,
  recapExtras,
  type CheckoutExtraJson,
} from "@/lib/checkout/extras-catalog";
import { CH_VAT_RATE_BPS, payableWithVatRappen, vatOnTopRappen } from "@/lib/checkout/vat";
import { payableRappen } from "@/lib/checkout/payable";
import { decodeClientSecret } from "@/lib/checkout/client-secret";
import { lockFlightNoDiffers } from "@/lib/checkout/flight-no";
import { checkoutTraveler } from "@/lib/checkout/checkout-traveler";
import { readCheckoutSession, writeCheckoutSession } from "@/lib/checkout/checkout-session-store";
import { chfRappenToDisplay } from "@/lib/fx/format";
import { useFx } from "@/lib/fx/use-fx";
import { useVamosLocale } from "@/lib/locale-shim";
import { formatAmount, type CurrencyCode } from "@/lib/currency";
import { routing } from "@/i18n/routing";
import { useCheckoutSettings } from "./CheckoutSettings";
import { CheckoutClassCards, classFits, firstFittingClass, type CheckoutClassOffer } from "./CheckoutClassCards";
import { PaymentPanel } from "./PaymentPanel";

const { useRouter } = createNavigation(routing);

export type CheckoutClientProps = {
  step: CheckoutStep;
};

const REFUSAL_KEYS: Record<string, string> = {
  quote_expired: "quoteExpired",
  quote_not_found: "quoteExpired",
  price_changed: "priceChanged",
  engine_changed: "engineChanged",
  pricing_not_live: "pricingNotLive",
  coupon_no_longer_valid: "couponNoLongerValid",
  quote_already_booked: "quoteAlreadyBooked",
  payment_window_closed: "paymentWindowClosed",
  invalid_request: "payCouldNotStart",
  email_failed: "emailFailed",
};

function vehicleLabel(id: string, t: (key: string) => string): string {
  if (id === "economy") return t("classEconomy");
  if (id === "business") return t("classBusiness");
  if (id === "first") return t("classFirst");
  if (id === "van") return t("classVan");
  return id;
}

function pickedClassName(slug: string, trip: VamosTrip | null, t: (key: string) => string): string {
  const named = trip?.classOffers?.find((row) => row.slug === slug)?.name;
  if (named) return named;
  if (trip?.vehicle === slug && trip.vehicleName) return trip.vehicleName;
  return vehicleLabel(slug, t);
}

const CLASS_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type ExtraToggles = { childSeat: boolean; oversized: boolean; extraStop: boolean };

function quoteExtras(
  toggles: ExtraToggles,
  stop?: { lng: number; lat: number; text: string } | null,
) {
  const extra_stops = toggles.extraStop ? 1 : 0;
  return {
    child_seats: toggles.childSeat ? 1 : 0,
    oversized_luggage: toggles.oversized,
    extra_stops,
    ...(extra_stops === 1 && stop
      ? { waypoints: [stop] }
      : {}),
  };
}

function couponAlreadyOn(applied: string | null, next: string | null): boolean {
  if (!applied || !next) return false;
  return applied.localeCompare(next, undefined, { sensitivity: "accent" }) === 0;
}

/** Missing/null → null so caller keeps 81 fallback. Present finite >= 0 → trunc. */
function readVatBps(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return Math.trunc(n);
  }
  return null;
}

type CouponFieldKey = "couponNotFound" | "couponNoLongerValid" | "couponAppliedOk";

type CouponEvalJson = {
  applied?: boolean;
  code?: string;
  rule?: string;
  kind?: "percent" | "amount";
  percent?: number | string | null;
};

type CouponRuleState = {
  kind: "percent" | "amount";
  percent: string | null;
  /** Hundredths of one percent, for payableRappen (D-08a) — never the display string. */
  percentHundredths: number | null;
};

function formatCouponPercent(raw: number | string | null | undefined): string | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(Number(n.toFixed(2)));
}

function couponPercentHundredthsFromRaw(raw: number | string | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

function couponRuleFromEval(coupon: CouponEvalJson | undefined): CouponRuleState | null {
  if (!coupon?.applied) return null;
  if (coupon.kind === "percent") {
    return {
      kind: "percent",
      percent: formatCouponPercent(coupon.percent),
      percentHundredths: couponPercentHundredthsFromRaw(coupon.percent),
    };
  }
  if (coupon.kind === "amount") return { kind: "amount", percent: null, percentHundredths: null };
  return null;
}

function couponFieldFromEval(
  coupon: CouponEvalJson | undefined,
  typed: boolean,
): CouponFieldKey | null {
  if (!typed) return null;
  if (coupon?.applied) return "couponAppliedOk";
  if (coupon?.rule === "not_found" || coupon?.rule == null) return "couponNotFound";
  return "couponNoLongerValid";
}

function nameParts(displayName: string | null): { firstName: string; lastName: string } {
  const trimmed = displayName?.trim() ?? "";
  if (!trimmed) return { firstName: "", lastName: "" };
  const i = trimmed.indexOf(" ");
  if (i < 0) return { firstName: trimmed, lastName: "" };
  return { firstName: trimmed.slice(0, i), lastName: trimmed.slice(i + 1).trim() };
}

const EMPTY_CONTACT: ContactFieldsValue = {
  firstName: "",
  lastName: "",
  email: "",
  mobile: "",
};

function billingKindFromFields(name: string, address: string, vat: string): "individual" | "company" {
  return name.trim() || address.trim() || vat.trim() ? "company" : "individual";
}

function scheduledLocalFor(trip: VamosTrip | null, date: string, time: string): string | null {
  const base = trip?.scheduled_local;
  if (time && /^\d{2}:\d{2}$/.test(time) && base && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(base)) {
    return `${base.slice(0, 10)}T${time}`;
  }
  if (base && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(base)) return base;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time)) return `${date}T${time}`;
  return null;
}

function isoDateFromTrip(trip: VamosTrip | null, date: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const sl = trip?.scheduled_local;
  if (typeof sl === "string" && /^\d{4}-\d{2}-\d{2}/.test(sl)) return sl.slice(0, 10);
  return "";
}

function isoTimeFromTrip(trip: VamosTrip | null, time: string): string {
  if (/^\d{2}:\d{2}$/.test(time)) return time;
  const sl = trip?.scheduled_local;
  if (typeof sl === "string" && sl.length >= 16) return sl.slice(11, 16);
  return "";
}

function classList(trip: VamosTrip | null): string[] {
  const fromTrip = trip?.classes?.filter((id) => CLASS_SLUG.test(id));
  if (fromTrip && fromTrip.length > 0) return fromTrip;
  return [];
}

function classOffersFromTrip(trip: VamosTrip | null): CheckoutClassOffer[] {
  const stored = trip?.classOffers;
  if (Array.isArray(stored) && stored.length > 0) {
    return stored
      .filter((row) => row && CLASS_SLUG.test(String(row.slug || "")))
      .map((row) => ({
        slug: String(row.slug),
        name: String(row.name || row.slug),
        photo: String(row.photo || ""),
        pax: typeof row.pax === "number" && Number.isFinite(row.pax) ? row.pax : 0,
        bags: typeof row.bags === "number" && Number.isFinite(row.bags) ? row.bags : 0,
      }));
  }
  return classList(trip).map((slug) => ({
    slug,
    name: trip?.vehicle === slug ? trip.vehicleName || slug : slug,
    photo: "",
    pax: 0,
    bags: 0,
  }));
}

function asDisplayCurrency(cur: string): CurrencyCode {
  if (cur === "EUR" || cur === "USD" || cur === "AED") return cur;
  return "CHF";
}

function asClassSlug(raw: string): string {
  const s = raw.trim().toLowerCase();
  return CLASS_SLUG.test(s) ? s : "";
}

function fareKindOrOneWay(value: unknown): "one_way" | "airport_pickup" | "city_to_city" {
  if (value === "one_way" || value === "one-way") return "one_way";
  if (value === "airport_pickup" || value === "airport-pickup") return "airport_pickup";
  if (value === "city_to_city" || value === "city-to-city") return "city_to_city";
  return "one_way";
}

export function CheckoutClient({ step }: CheckoutClientProps) {
  const { locale, freeCancelHours, checkoutWindowMinutes, publishableKey } =
    useCheckoutSettings();
  const t = useTranslations("checkout");
  const tCommon = useTranslations("common");
  const tBooking = useTranslations("booking");
  const tHome = useTranslations("home");
  const tAccount = useTranslations("account");
  const tAuth = useTranslations("auth");
  const router = useRouter();
  const { cur } = useVamosLocale();
  const fx = useFx();
  const displayCur = asDisplayCurrency(cur);
  const [draft, writeDraft] = useBookingDraft();

  const [gate, setGate] = useState<"check" | "ok">("check");
  const [pickup, setPickup] = useState("");
  const [destination, setDestination] = useState("");
  const [pickupPlace, setPickupPlace] = useState<unknown>(null);
  const [dropoffPlace, setDropoffPlace] = useState<unknown>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [vehicle, setVehicle] = useState("economy");
  const [contact, setContact] = useState<ContactFieldsValue>({
    firstName: "",
    lastName: "",
    email: "",
    mobile: "",
  });
  const [errors, setErrors] = useState<ContactFieldsErrors>({});
  const [guest, setGuest] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [forOther, setForOther] = useState(false);
  const [accountContact, setAccountContact] = useState<ContactFieldsValue | null>(null);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [airline, setAirline] = useState("");
  const [notes, setNotes] = useState("");
  const [childSeat, setChildSeat] = useState(false);
  const [oversized, setOversized] = useState(false);
  const [extraStop, setExtraStop] = useState(false);
  const [extraStopText, setExtraStopText] = useState("");
  const [extraStopWaypoint, setExtraStopWaypoint] = useState<{
    lng: number;
    lat: number;
    text: string;
  } | null>(null);
  const [skiRack, setSkiRack] = useState(false);
  const [extraCodes, setExtraCodes] = useState<string[]>([]);
  const [meetGreet, setMeetGreet] = useState(false);
  const [freeWait, setFreeWait] = useState(false);
  const [extrasCatalog, setExtrasCatalog] = useState<CheckoutExtraJson[]>([]);
  const [vatRateBps, setVatRateBps] = useState(CH_VAT_RATE_BPS);
  const [coupon, setCoupon] = useState("");
  const [couponApplied, setCouponApplied] = useState<string | null>(null);
  const [couponRule, setCouponRule] = useState<CouponRuleState | null>(null);
  const [couponInvalid, setCouponInvalid] = useState(false);
  const [couponField, setCouponField] = useState<CouponFieldKey | null>(null);
  const [wasRappen, setWasRappen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  useEffect(() => {
    const pay = new URLSearchParams(window.location.search).get("pay");
    if (pay === "unpaid" || pay === "failed") setRefusal("payCouldNotStart");
  }, []);
  const [quoteLockZero, setQuoteLockZero] = useState(false);
  const quoteLockZeroRef = useRef(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [clientSecretHex, setClientSecretHex] = useState<string | undefined>();
  const clientSecretRef = useRef<string | null>(null);
  const intentGate = useRef<Promise<"ok" | "skip" | "fail"> | null>(null);
  const flightSyncGate = useRef<Promise<boolean> | null>(null);
  const [publishable, setPublishable] = useState(publishableKey);
  const [reference, setReference] = useState<string | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const payInFlight = useRef(false);
  const payLinkKept = useRef(false);
  const paymentStay = useRef(0);
  const [billingKind, setBillingKind] = useState<"individual" | "company">("individual");
  const [companyName, setCompanyName] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyVat, setCompanyVat] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [confirmPay, setConfirmPay] = useState<(() => Promise<void>) | null>(null);
  const [cardComplete, setCardComplete] = useState(false);
  const [tripSnap, setTripSnap] = useState<VamosTrip | null>(null);
  const intentStarted = useRef(false);
  const [intentTick, setIntentTick] = useState(0);
  const intentAttempts = useRef(0);

  const confirmPayRef = useRef<(() => Promise<void>) | null>(null);
  const onPaymentReady = useCallback((fn: () => Promise<void>) => {
    confirmPayRef.current = fn;
    setConfirmPay(() => fn);
  }, []);

  const onPaymentComplete = useCallback((complete: boolean) => {
    setCardComplete(complete);
  }, []);

  useEffect(() => {
    let on = true;
    function load() {
      fetch("/api/checkout/extras", { cache: "no-store" })
        .then((res) => res.json())
        .then((json: unknown) => {
          if (!on || !json || typeof json !== "object") return;
          const body = json as {
            ok?: boolean;
            extras?: CheckoutExtraJson[];
            vat_rate_bps?: unknown;
          };
          if (body.ok && Array.isArray(body.extras)) {
            setExtrasCatalog(body.extras);
          }
          if (body.ok) {
            const bps = readVatBps(body.vat_rate_bps);
            if (bps != null) setVatRateBps(bps);
          }
        })
        .catch(() => {});
    }
    load();
    const timer = window.setInterval(load, 4000);
    return () => {
      on = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let on = true;
    fetch("/api/auth/session", { credentials: "same-origin" })
      .then((res) => res.json())
      .then((json: unknown) => {
        if (!on || !json || typeof json !== "object") return;
        const body = json as {
          signedIn?: boolean;
          displayName?: string | null;
          email?: string | null;
          phone?: string | null;
        };
        if (!body.signedIn) return;
        const parts = nameParts(body.displayName ?? null);
        const next: ContactFieldsValue = {
          firstName: parts.firstName,
          lastName: parts.lastName,
          email: (body.email ?? "").trim(),
          mobile: e164Phone(body.phone ?? ""),
        };
        setSignedIn(true);
        setAccountContact(next);
        setContact((current) => {
          const saved = readVamosTrip()?.contact;
          const base =
            current.firstName.trim() || current.email.trim()
              ? current
              : saved
                ? { ...saved, mobile: e164Phone(saved.mobile), email: saved.email.trim() }
                : current;
          return {
            firstName: base.firstName.trim() || next.firstName,
            lastName: base.lastName.trim() || next.lastName,
            email: base.email.trim() || next.email,
            mobile: e164Phone(base.mobile).length >= 10 ? e164Phone(base.mobile) : next.mobile,
          };
        });
        setPayerEmail((email) => email || next.email);
        setGuest(false);
      })
      .catch(() => {});
    return () => {
      on = false;
    };
  }, []);

  useEffect(() => {
    if (step !== "payment") return;
    const token = ++paymentStay.current;
    const abandon = () => {
      if (payInFlight.current || payLinkKept.current) return;
      const quoteId = tripQuoteId(readVamosTrip());
      if (!quoteId) return;
      try {
        void fetch("/api/checkout/abandon", {
          method: "POST",
          credentials: "same-origin",
          keepalive: true,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ quote_id: quoteId }),
        }).catch(() => undefined);
        window.localStorage.removeItem("vamosTrip");
        window.localStorage.removeItem("vamosQuoteLock");
        window.sessionStorage.removeItem("vamosTrip");
      } catch {
        /* unload */
      }
    };
    const onHide = () => abandon();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.setTimeout(() => {
        if (paymentStay.current !== token) return;
        abandon();
      }, 0);
    };
  }, [step]);

  useEffect(() => {
    const trip = readVamosTrip();
    const bounce = bouncePath(step, trip);
    const expiredPayLand = step === "payment" && lockExpired(trip);
    if (bounce && !expiredPayLand) {
      router.replace(bounce);
      return;
    }
    setTripSnap(trip);
    const nextPickup = tripPickup(trip);
    const nextDrop = tripDropoff(trip);
    const offered = classList(trip);
    const requested = asClassSlug(tripVehicle(trip));
    const nextVehicle = offered.includes(requested)
      ? requested
      : offered[0] ?? requested;
    const nextDate = isoDateFromTrip(trip, trip?.date ?? "");
    const nextTime = isoTimeFromTrip(trip, trip?.time ?? "");
    setPickup(nextPickup);
    setDestination(nextDrop);
    setPickupPlace(trip?.pickupPlace ?? null);
    setDropoffPlace(trip?.dropoffPlace ?? null);
    setDate(nextDate);
    setTime(nextTime);
    setVehicle(nextVehicle);
    if (trip?.contact) {
      setContact({
        ...trip.contact,
        mobile: e164Phone(trip.contact.mobile),
        email: trip.contact.email.trim(),
      });
      setPayerEmail((email) => email || trip.contact?.email || "");
    }
    if (typeof trip?.guest === "boolean") setGuest(trip.guest);
    if (trip?.airline) setAirline(trip.airline);
    if (trip?.notes) setNotes(trip.notes);
    if (trip?.billingKind === "company" || trip?.billingKind === "individual") {
      setBillingKind(trip.billingKind);
    }
    const incomingQuote = tripQuoteId(trip);
    const stored = readDraft();
    const quoteChanged = Boolean(incomingQuote && stored.quoteId && incomingQuote !== stored.quoteId);
    if (quoteChanged) {
      setClientSecret(null);
      setClientSecretHex(undefined);
      clientSecretRef.current = null;
      setChildSeat(false);
      setOversized(false);
      setExtraStop(false);
      setSkiRack(false);
      setExtraCodes([]);
      setMeetGreet(false);
      setFreeWait(false);
      setReference(null);
      setConfirmPay(null);
      setCardComplete(false);
      intentStarted.current = false;
      intentAttempts.current = 0;
    } else if (step !== "trip") {
      if (typeof trip?.childSeat === "boolean") setChildSeat(trip.childSeat);
      if (typeof trip?.oversizedLuggage === "boolean") setOversized(trip.oversizedLuggage);
      if (typeof trip?.stops === "number") setExtraStop(trip.stops > 0);
      if (typeof trip?.skiRack === "boolean") setSkiRack(trip.skiRack);
      if (typeof trip?.meetGreet === "boolean") setMeetGreet(trip.meetGreet);
      if (typeof trip?.freeWait === "boolean") setFreeWait(trip.freeWait);
      if (Array.isArray(trip?.extrasOn)) {
        setExtraCodes(trip.extrasOn.filter((code): code is string => typeof code === "string"));
      }
    }
    writeDraft({
      pickup: nextPickup,
      destination: nextDrop,
      date: nextDate,
      time: nextTime,
      passengers: tripPax(trip),
      luggage: tripBags(trip),
      flightNumber: trip?.flightNumber || trip?.flight || "",
      quoteId: incomingQuote || undefined,
      lock: trip?.lock || undefined,
      vehicleClass: nextVehicle,
      idempotencyKey:
        incomingQuote && incomingQuote === stored.quoteId && stored.idempotencyKey
          ? stored.idempotencyKey
          : incomingQuote
            ? crypto.randomUUID()
            : stored.idempotencyKey,
    });
    if (step === "payment" && incomingQuote) {
      const stored = readCheckoutSession(incomingQuote);
      if (stored && !clientSecretRef.current) {
        clientSecretRef.current = stored.clientSecret;
        setClientSecret(stored.clientSecret);
        setClientSecretHex(stored.clientSecretHex);
        if (stored.publishableKey) setPublishable(stored.publishableKey);
        if (stored.reference) setReference(stored.reference);
      }
    }
    setGate("ok");
  }, [step, router, writeDraft]);

  useEffect(() => {
    if (!draft.quoteId) return;
    if (draft.idempotencyKey) return;
    // Mint once per quote. A new idempotency_key per Pay click would raise
    // quote_already_booked on retry (plan 07-02). Reload and card retry reuse it.
    writeDraft({ idempotencyKey: crypto.randomUUID() });
  }, [draft.quoteId, draft.idempotencyKey, writeDraft]);

  function resolvePaySlug(lock: string | undefined, trip: VamosTrip | null | undefined): string {
    return firstPricedLockSlug(lock, [
      asClassSlug(draft.vehicleClass || ""),
      asClassSlug(tripVehicle(trip) || ""),
      ...(trip?.classes ?? []),
      vehicle,
    ]);
  }

  useEffect(() => {
    // Do not adopt the idle default, or wipe the saved class, before the trip is read.
    if (!tripSnap) return;
    const lock = tripSnap.lock || draft.lock;
    const offered = classOffersFromTrip(tripSnap);
    const priced = resolvePaySlug(lock, tripSnap);
    if (priced && !classIsSelectable(peekLockClassRappen(lock, vehicle)) && priced !== vehicle) {
      setVehicle(priced);
      writeDraft({ vehicleClass: priced });
      writeVamosTrip({ vehicle: priced, pax: draft.passengers, bags: draft.luggage });
      return;
    }
    const slugs = offered.map((row) => row.slug);
    function pricedFit(candidate: string): string {
      if (candidate && classIsSelectable(peekLockClassRappen(lock, candidate))) return candidate;
      return priced && priced !== vehicle ? priced : "";
    }
    if (slugs.length > 0 && !slugs.includes(vehicle)) {
      const next = pricedFit(firstFittingClass(draft.passengers, draft.luggage, offered));
      if (!next || next === vehicle) return;
      setVehicle(next);
      writeDraft({ vehicleClass: next });
      writeVamosTrip({ vehicle: next, pax: draft.passengers, bags: draft.luggage });
      return;
    }
    if (classFits(vehicle, draft.passengers, draft.luggage, offered)) return;
    const next = pricedFit(firstFittingClass(draft.passengers, draft.luggage, offered));
    if (!next || next === vehicle) return;
    setVehicle(next);
    writeDraft({ vehicleClass: next });
    writeVamosTrip({ vehicle: next, pax: draft.passengers, bags: draft.luggage });
  }, [draft.passengers, draft.luggage, draft.lock, draft.vehicleClass, vehicle, tripSnap, writeDraft]);

  useEffect(() => {
    if (step !== "payment" || gate !== "ok") return;
    const trip = tripSnap ?? readVamosTrip();
    const lock = draft.lock || trip?.lock;
    const pricedSlug = resolvePaySlug(lock, trip);
    const past = lockExpired(trip) || quoteLockZero;
    const unpriced = !classIsSelectable(peekLockClassRappen(lock, pricedSlug));
    if (past || unpriced) {
      setRefusal(past ? "quoteExpired" : "pricingNotLive");
      return;
    }
    setRefusal((current) => (current === "pricingNotLive" ? null : current));
    if (clientSecret) return;
    if (intentAttempts.current >= 6) return;
    const traveler = checkoutTraveler(contact, trip?.contact);
    if (
      traveler &&
      (contact.firstName !== traveler.firstName ||
        contact.lastName !== traveler.lastName ||
        contact.email !== traveler.email ||
        contact.mobile !== traveler.mobile)
    ) {
      setContact(traveler);
    }
    void startPayment({ silent: true }).then((result) => {
      if (result === "ok") return;
      intentAttempts.current += 1;
      if (intentAttempts.current >= 6) {
        setRefusal((current) => current ?? "payCouldNotStart");
        return;
      }
      window.setTimeout(() => setIntentTick((n) => n + 1), 400);
    });
  }, [
    step,
    gate,
    clientSecret,
    draft.idempotencyKey,
    draft.quoteId,
    draft.lock,
    draft.vehicleClass,
    quoteLockZero,
    vehicle,
    contact.firstName,
    contact.lastName,
    contact.email,
    contact.mobile,
    intentTick,
    tripSnap,
  ]);

  function onQuoteLockZero() {
    quoteLockZeroRef.current = true;
    setQuoteLockZero(true);
    setRefusal("quoteExpired");
    const trip = tripSnap ?? readVamosTrip();
    const quoteId = draft.quoteId || tripQuoteId(trip);
    if (!quoteId) return;
    void fetch("/api/checkout/lock-expire", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quote_id: quoteId, quoteId }),
    });
  }

  useEffect(() => {
    if (step !== "payment") return;
    const expiresAt = tripSnap?.expires_at ?? readVamosTrip()?.expires_at;
    if (!expiresAt) return;
    const at = Date.parse(expiresAt);
    if (!Number.isFinite(at)) return;
    const delay = at - Date.now();
    if (delay <= 0) {
      onQuoteLockZero();
      return;
    }
    const id = window.setTimeout(onQuoteLockZero, delay);
    return () => window.clearTimeout(id);
  }, [step, tripSnap]);

  function validate(): boolean {
    const next: ContactFieldsErrors = {};
    if (!contact.firstName.trim()) next.firstName = t("enter-a-first-name");
    if (!contact.lastName.trim()) next.lastName = t("enter-a-last-name");
    if (!contact.email.trim()) next.email = t("enter-an-email-address");
    else if (!isCheckoutEmail(contact.email)) next.email = t("enter-an-email-address");
    if (!e164Phone(contact.mobile) || e164Phone(contact.mobile).length < 10) {
      next.mobile = t("enter-a-mobile-number");
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function continueTrip() {
    const trip = readVamosTrip();
    const edited =
      pickup !== tripPickup(trip) ||
      destination !== tripDropoff(trip) ||
      date !== isoDateFromTrip(trip, trip?.date ?? "") ||
      time !== isoTimeFromTrip(trip, trip?.time ?? "") ||
      draft.passengers !== tripPax(trip) ||
      draft.luggage !== tripBags(trip) ||
      vehicle !== tripVehicle(trip) ||
      placeMapboxId(pickupPlace) !== placeMapboxId(trip?.pickupPlace) ||
      placeMapboxId(dropoffPlace) !== placeMapboxId(trip?.dropoffPlace);
    if (hasQuoteLock(trip) && !edited) {
      writeVamosTrip({
        pickup,
        dropoff: destination,
        date,
        time,
        vehicle,
        pax: draft.passengers,
        bags: draft.luggage,
        flightNumber: draft.flightNumber,
        pickupPlace,
        dropoffPlace,
      });
      writeDraft({ vehicleClass: vehicle });
      router.push(checkoutStepPath("details"));
      return;
    }
    await relockTrip();
  }

  async function relockTrip() {
    const trip = readVamosTrip();
    const scheduled = scheduledLocalFor(trip, date, time);
    if (!pickupPlace || !dropoffPlace || !scheduled) {
      setRefusal("quoteExpired");
      return;
    }
    setBusy(true);
    setRefusal(null);
    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locale,
          display_currency: displayCur,
          mode: "one_way",
          fare_kind: fareKindOrOneWay((trip as { fare_kind?: unknown } | null)?.fare_kind),
          pickup: pickupPlace,
          dropoff: dropoffPlace,
          legs: [{ leg_seq: 1, scheduled_local: scheduled, flight_no: draft.flightNumber || null }],
          pax: Math.max(1, draft.passengers),
          bags: Math.max(0, draft.luggage),
          preferred_class: CLASS_SLUG.test(vehicle) ? vehicle : undefined,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        quote_id?: string;
        lock?: string;
        expires_at?: string;
        classes?: {
          slug?: string;
          total_rappen?: number | null;
          name?: string;
          photo_url?: string;
          photo_path?: string;
          effective_max_pax?: number;
          max_bags?: number;
        }[];
      };
      if (!res.ok || json.ok !== true || !json.quote_id || !json.lock) {
        setRefusal("quoteExpired");
        return;
      }
      const priced = (json.classes ?? [])
        .filter((c) => c.slug && c.total_rappen != null)
        .map((c) => c.slug as string);
      const classOffers: CheckoutClassOffer[] = (json.classes ?? [])
        .filter((c) => c.slug && CLASS_SLUG.test(c.slug))
        .map((c) => ({
          slug: c.slug as string,
          name: String(c.name || c.slug),
          photo: String(c.photo_url || c.photo_path || ""),
          pax: typeof c.effective_max_pax === "number" ? c.effective_max_pax : 0,
          bags: typeof c.max_bags === "number" ? c.max_bags : 0,
        }));
      const next = writeVamosTrip({
        pickup,
        dropoff: destination,
        date,
        time,
        vehicle,
        quote_id: json.quote_id,
        lock: json.lock,
        expires_at: json.expires_at,
        scheduled_local: scheduled,
        classes: priced.length ? priced : classList(trip),
        classOffers: classOffers.length ? classOffers : classOffersFromTrip(trip),
        pickupPlace,
        dropoffPlace,
        display_currency: displayCur,
        flightNumber: draft.flightNumber,
        flight: draft.flightNumber,
      });
      setTripSnap(next);
      writeDraft({
        pickup,
        destination,
        date,
        time,
        quoteId: json.quote_id,
        lock: json.lock,
        vehicleClass: vehicle,
        idempotencyKey: crypto.randomUUID(),
      });
      router.push(checkoutStepPath("details"));
    } catch {
      setRefusal("quoteExpired");
    } finally {
      setBusy(false);
    }
  }

  async function continueDetails() {
    const tripForPay = tripSnap ?? readVamosTrip();
    const payLock = draft.lock || tripForPay?.lock;
    const detailsSlug = resolvePaySlug(payLock, tripForPay);
    if (
      detailsSlug &&
      detailsSlug !== vehicle &&
      !classIsSelectable(peekLockClassRappen(payLock, vehicle))
    ) {
      setVehicle(detailsSlug);
      writeDraft({ vehicleClass: detailsSlug });
      writeVamosTrip({ vehicle: detailsSlug });
    }
    if (!classIsSelectable(peekLockClassRappen(payLock, detailsSlug || vehicle))) {
      return;
    }
    if (!validate()) return;
    // D-08b: the airport fee for a flight number typed here is in the lock
    // before the payment step opens a Stripe session.
    if (!(await syncFlightToLock())) return;
    setPasswordError(undefined);
    if (!guest && !signedIn) {
      if (password.length < 8) {
        setPasswordError(tAuth("password-policy"));
        return;
      }
      setBusy(true);
      try {
        const res = await fetch("/api/auth", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            locale,
            mode: "signup",
            method: "password",
            email: contact.email.trim(),
            password,
            firstName: contact.firstName.trim(),
            lastName: contact.lastName.trim(),
          }),
        });
        const json = (await res.json()) as { stage?: string; ok?: boolean };
        if (json.stage === "form") {
          setPasswordError(tAuth("password-policy"));
          return;
        }
      } catch {
        setPasswordError(tAuth("password-policy"));
        return;
      } finally {
        setBusy(false);
      }
    }
    writeVamosTrip({
      detailsComplete: true,
      contact: { ...contact, mobile: e164Phone(contact.mobile) },
      guest,
      airline,
      notes,
      childSeat,
      oversizedLuggage: oversized,
      stops: extraStop ? 1 : 0,
      skiRack,
      billingKind,
      flightNumber: draft.flightNumber,
    });
    if (
      shouldPersistUnpaidBooking("details", {
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        mobile: contact.mobile,
      })
    ) {
      await startPayment({ silent: true });
    }
    router.push(checkoutStepPath("payment"));
  }

  async function startPayment(opts?: { silent?: boolean }): Promise<"ok" | "skip" | "fail"> {
    if (clientSecretRef.current) return "ok";
    if (intentGate.current) return intentGate.current;
    const run = (async (): Promise<"ok" | "skip" | "fail"> => {
    if (clientSecretRef.current) return "ok";
    const trip = tripSnap ?? readVamosTrip();
    // readDraft(): a flight re-price may have re-signed the lock this tick.
    const liveDraft = readDraft();
    const quoteId = liveDraft.quoteId || draft.quoteId || tripQuoteId(trip);
    const lock = liveDraft.lock || draft.lock || trip?.lock;
    const vehicleClass = asClassSlug(
      resolvePaySlug(lock, trip) || draft.vehicleClass || vehicle || tripVehicle(trip),
    );
    let idempotencyKey = draft.idempotencyKey;
    if (!idempotencyKey && quoteId) {
      idempotencyKey = crypto.randomUUID();
      writeDraft({
        idempotencyKey,
        quoteId,
        ...(lock ? { lock } : {}),
        ...(vehicleClass ? { vehicleClass } : {}),
      });
    }
    const traveler = checkoutTraveler(contact, trip?.contact);
    const name = traveler ? `${traveler.firstName} ${traveler.lastName}`.trim() : "";
    const email = traveler?.email ?? "";
    const phone = traveler?.mobile ?? "";
    if (!quoteId || !lock || !vehicleClass || !idempotencyKey) {
      if (!opts?.silent) setRefusal("quoteExpired");
      return "skip";
    }
    if (quoteLockZeroRef.current) {
      return clientSecretRef.current ? "ok" : "skip";
    }
    if (lockExpired(trip) || !classIsSelectable(peekLockClassRappen(lock, vehicleClass))) {
      if (!opts?.silent) setRefusal(lockExpired(trip) ? "quoteExpired" : "pricingNotLive");
      return "skip";
    }
    if (!name || !email || !phone) {
      if (!opts?.silent) setRefusal("payCouldNotStart");
      return "skip";
    }
    if (peekLockClassRappen(lock, vehicleClass) == null) {
      if (!opts?.silent || step === "payment") setRefusal("pricingNotLive");
      return "fail";
    }
    intentStarted.current = true;
    if (!opts?.silent) {
      setRefusal(null);
    }
    try {
      const res = await fetch("/api/checkout/intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(25_000),
        body: JSON.stringify({
          quote_id: quoteId,
          lock,
          vehicle_class: vehicleClass,
          extras: quoteExtras({ childSeat, oversized, extraStop }, extraStopWaypoint),
          coupon: couponApplied || null,
          // D-08b: the server refuses price_changed if the lock never priced it.
          flight_no: liveDraft.flightNumber.trim() || null,
          contact: {
            name,
            email,
            phone,
          },
          locale,
          display_currency: displayCur,
          idempotency_key: idempotencyKey,
        }),
      });
      const json = (await res.json()) as {
        client_secret?: string;
        client_secret_hex?: string;
        publishable_key?: string;
        reference?: string;
        vat_rate_bps?: unknown;
        code?: string;
        error?: string;
      };
      if (!res.ok) {
        intentStarted.current = false;
        const key = REFUSAL_KEYS[json.code ?? json.error ?? ""] ?? "payCouldNotStart";
        if (json.code === "coupon_no_longer_valid") {
          setCouponApplied(null);
          setCouponInvalid(true);
          setCouponField("couponNoLongerValid");
          return "fail";
        }
        if (!opts?.silent || step === "payment") setRefusal(key);
        return "fail";
      }
      if (json.publishable_key) setPublishable(json.publishable_key);
      if (json.reference) setReference(json.reference);
      const intentBps = readVatBps(json.vat_rate_bps);
      if (intentBps != null) setVatRateBps(intentBps);
      const secret = decodeClientSecret(json.client_secret, json.client_secret_hex);
      clientSecretRef.current = secret;
      setClientSecret(secret);
      setClientSecretHex(json.client_secret_hex);
      if (!secret) {
        intentStarted.current = false;
        if (!opts?.silent || step === "payment") setRefusal("payCouldNotStart");
        return "fail";
      }
      writeCheckoutSession({
        quoteId,
        clientSecret: secret,
        clientSecretHex: json.client_secret_hex,
        publishableKey: json.publishable_key,
        reference: json.reference,
      });
      return "ok";
    } catch {
      intentStarted.current = false;
      if (!opts?.silent || step === "payment") setRefusal("payCouldNotStart");
      return "fail";
    }
    })();
    intentGate.current = run;
    try {
      return await run;
    } finally {
      if (intentGate.current === run) intentGate.current = null;
    }
  }

  /**
   * D-08b / 26.1-30: the airport fee follows the flight number. When the
   * details flight number is not the one the lock priced, re-price with it so
   * the fee is in the re-signed lock before payment. Returns false when the
   * re-price was refused; the existing refusal copy is shown.
   */
  async function syncFlightToLock(): Promise<boolean> {
    if (flightSyncGate.current) await flightSyncGate.current;
    const live = readDraft();
    const trip = tripSnap ?? readVamosTrip();
    const quoteId = live.quoteId || tripQuoteId(trip);
    const lock = live.lock || trip?.lock;
    const flight = live.flightNumber.trim();
    if (!quoteId || !lock || !lockFlightNoDiffers(lock, flight)) return true;
    const run = (async (): Promise<boolean> => {
      setBusy(true);
      try {
        const res = await fetch("/api/quote/reprice", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            quote_id: quoteId,
            lock,
            locale,
            display_currency: displayCur,
            legs: [{ leg_seq: 1, flight_no: flight || null }],
            contact_email: contact.email.trim() || null,
          }),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          lock?: string;
          quote_id?: string;
          expires_at?: string;
          code?: string;
        };
        if (!res.ok || !json.ok || !json.lock) {
          setRefusal(REFUSAL_KEYS[json.code ?? ""] ?? "priceChanged");
          return false;
        }
        const nextId = json.quote_id ?? quoteId;
        writeDraft({ quoteId: nextId, lock: json.lock });
        writeVamosTrip({
          quoteId: nextId,
          quote_id: nextId,
          lock: json.lock,
          expires_at: json.expires_at,
          flightNumber: flight,
          flight,
        });
        setTripSnap((prev) => ({
          ...(prev ?? {}),
          quoteId: nextId,
          quote_id: nextId,
          lock: json.lock,
          expires_at: json.expires_at,
        }));
        setRefusal(null);
        // A Stripe session opened on the old lock no longer matches the price.
        setClientSecret(null);
        setClientSecretHex(undefined);
        clientSecretRef.current = null;
        setConfirmPay(null);
        intentStarted.current = false;
        intentAttempts.current = 0;
        setIntentTick((n) => n + 1);
        return true;
      } catch {
        setRefusal("priceChanged");
        return false;
      } finally {
        setBusy(false);
      }
    })();
    flightSyncGate.current = run;
    try {
      return await run;
    } finally {
      if (flightSyncGate.current === run) flightSyncGate.current = null;
    }
  }

  async function applyCouponCode(
    code: string | null,
    extras?: Partial<ExtraToggles>,
    stop: { lng: number; lat: number; text: string } | null = extraStopWaypoint,
  ) {
    const trip = tripSnap ?? readVamosTrip();
    const quoteId = draft.quoteId || tripQuoteId(trip);
    const lock = draft.lock || trip?.lock;
    const seats = extras?.childSeat ?? childSeat;
    const bags = extras?.oversized ?? oversized;
    const stopsOn = extras?.extraStop ?? extraStop;
    if (!quoteId || !lock) {
      setRefusal("quoteExpired");
      return;
    }
    const nextCode = code == null ? null : code.trim().toUpperCase() || null;
    if (!extras && couponAlreadyOn(couponApplied, nextCode)) {
      return;
    }
    const beforeRappen = peekLockClassRappen(lock, vehicle);
    setBusy(true);
    try {
      const res = await fetch("/api/quote/reprice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          quote_id: quoteId,
          lock,
          locale,
          display_currency: displayCur,
          coupon: nextCode,
          extras: quoteExtras({ childSeat: seats, oversized: bags, extraStop: stopsOn }, stop),
          contact_email: contact.email.trim() || null,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        lock?: string;
        quote_id?: string;
        expires_at?: string;
        code?: string;
        coupon?: CouponEvalJson;
      };
      if (!res.ok || !json.ok || !json.lock) {
        const key = REFUSAL_KEYS[json.code ?? ""] ?? null;
        if (key && key !== "couponNoLongerValid") {
          setRefusal(key);
          return;
        }
        if (nextCode) {
          setCouponApplied(null);
          setCouponRule(null);
          setWasRappen(null);
          setCouponInvalid(true);
          setCouponField(couponFieldFromEval(json.coupon, true));
        }
        return;
      }
      if (nextCode && !json.coupon?.applied) {
        if (!couponApplied) {
          setCouponApplied(null);
          setCouponRule(null);
        }
        setCouponInvalid(true);
        setCouponField(couponFieldFromEval(json.coupon, true));
        return;
      }
      const nextId = json.quote_id ?? quoteId;
      writeDraft({ quoteId: nextId, lock: json.lock });
      writeVamosTrip({
        quoteId: nextId,
        quote_id: nextId,
        lock: json.lock,
        expires_at: json.expires_at,
        flightNumber: draft.flightNumber,
        flight: draft.flightNumber,
        childSeat: seats,
        oversizedLuggage: bags,
        skiRack,
        stops: stopsOn ? 1 : 0,
      });
      setTripSnap((prev) => ({
        ...(prev ?? {}),
        quoteId: nextId,
        quote_id: nextId,
        lock: json.lock,
        expires_at: json.expires_at,
      }));
      const applied = Boolean(nextCode && json.coupon?.applied);
      const appliedCode = applied ? (json.coupon?.code ?? nextCode) : null;
      setCouponApplied(appliedCode);
      setCouponRule(applied ? couponRuleFromEval(json.coupon) : null);
      setCouponInvalid(false);
      setCouponField(applied ? "couponAppliedOk" : null);
      if (appliedCode) setCoupon(appliedCode);
      if (applied && !couponApplied && beforeRappen != null) {
        setWasRappen(beforeRappen);
      } else if (!applied) {
        setWasRappen(null);
      }
      setRefusal(null);
      setClientSecret(null);
      setClientSecretHex(undefined);
      clientSecretRef.current = null;
      setConfirmPay(null);
      intentStarted.current = false;
      intentAttempts.current = 0;
      setIntentTick((n) => n + 1);
    } catch {
      if (nextCode) {
        setCouponInvalid(true);
        setCouponField("couponNoLongerValid");
      }
    } finally {
      setBusy(false);
    }
  }

  async function sendPayLink() {
    const trip = tripSnap ?? readVamosTrip();
    const saved = trip?.contact;
    const traveler = {
      name: `${(contact.firstName || saved?.firstName || "").trim()} ${(contact.lastName || saved?.lastName || "").trim()}`.trim(),
      email: (contact.email || saved?.email || "").trim(),
      phone: e164Phone(contact.mobile || saved?.mobile || ""),
    };
    const quoteId = draft.quoteId || tripQuoteId(trip);
    const lock = draft.lock || trip?.lock;
    const vehicleClass = asClassSlug(resolvePaySlug(lock, trip) || draft.vehicleClass || vehicle);
    const idempotencyKey = draft.idempotencyKey;
    if (!quoteId || !lock || !vehicleClass || !idempotencyKey) {
      setRefusal("quoteExpired");
      return;
    }
    if (peekLockClassRappen(lock, vehicleClass) == null) {
      setRefusal("pricingNotLive");
      return;
    }
    const payer = payerEmail.trim();
    if (!isCheckoutEmail(payer) || !traveler.name || !isCheckoutEmail(traveler.email) || traveler.phone.length < 10) {
      return;
    }
    setBusy(true);
    setRefusal(null);
    try {
      const res = await fetch("/api/checkout/pay-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          quote_id: quoteId,
          lock,
          vehicle_class: vehicleClass,
          extras: quoteExtras({ childSeat, oversized, extraStop }, extraStopWaypoint),
          coupon: couponApplied,
          flight_no: draft.flightNumber.trim() || null,
          contact: {
            name: traveler.name,
            email: traveler.email,
            phone: traveler.phone,
          },
          locale,
          display_currency: displayCur,
          idempotency_key: idempotencyKey,
          billing_kind: billingKindFromFields(companyName, companyAddress, companyVat),
          company_name: companyName,
          company_address: companyAddress,
          company_vat: companyVat,
          payer_email: payer,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        reference?: string;
        pay_url?: string;
        code?: string;
        error?: string;
      };
      if (!res.ok) {
        // Every refusal is visible: an unknown code or validate-fail falls back to
        // payCouldNotStart instead of leaving the payer with a silent button (plan 21-10).
        const key = REFUSAL_KEYS[json.code ?? json.error ?? ""] ?? "payCouldNotStart";
        setRefusal(key);
        return;
      }
      payLinkKept.current = true;
      if (json.reference) setReference(json.reference);
      if (json.pay_url) setPayUrl(json.pay_url);
    } catch {
      // A network drop means the link was not sent: say so, never stay silent.
      setRefusal("emailFailed");
    } finally {
      setBusy(false);
    }
  }

  async function onPay() {
    if (refusal === "pricingNotLive" || refusal === "quoteExpired" || quoteLockZero) return;
    const trip = tripSnap ?? readVamosTrip();
    const lock = draft.lock || trip?.lock;
    const vehicleClass = asClassSlug(resolvePaySlug(lock, trip) || draft.vehicleClass || vehicle);
    if (
      !vehicleClass ||
      peekLockClassRappen(lock, vehicleClass) == null ||
      !classIsSelectable(peekLockClassRappen(lock, vehicleClass))
    ) {
      setRefusal("pricingNotLive");
      return;
    }
    if (!cardComplete) {
      setRefusal("completeCard");
      return;
    }
    setBusy(true);
    setRefusal(null);
    setPayError(null);
    payInFlight.current = true;
    try {
      const started = await startPayment();
      if (started !== "ok") {
        payInFlight.current = false;
        setRefusal((current) =>
          current === "pricingNotLive" || current === "quoteExpired" ? current : (current ?? "payCouldNotStart"),
        );
        return;
      }
      const deadline = Date.now() + 25_000;
      while (!confirmPayRef.current && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      const confirm = confirmPayRef.current;
      if (!confirm) {
        payInFlight.current = false;
        setRefusal((current) =>
          current === "pricingNotLive" || current === "quoteExpired" ? current : "payCouldNotStart",
        );
        return;
      }
      await confirm();
    } catch (err) {
      payInFlight.current = false;
      const message = err instanceof Error ? err.message : "";
      if (message && message !== "payCouldNotStart" && message !== "checkout-not-ready") {
        setPayError(message);
        return;
      }
      setRefusal((current) =>
        current === "pricingNotLive" || current === "quoteExpired" ? current : "payCouldNotStart",
      );
    } finally {
      setBusy(false);
    }
  }

  const tripForPay = tripSnap ?? readVamosTrip();
  const payLockToken = tripForPay?.lock || draft.lock;
  const paySlug = resolvePaySlug(payLockToken, tripForPay);
  const classFareRappen = peekLockClassRappen(
    payLockToken,
    paySlug || asClassSlug(draft.vehicleClass || vehicle) || vehicle,
  );
  const requote =
    refusal === "quoteExpired" ||
    refusal === "priceChanged" ||
    refusal === "engineChanged" ||
    refusal === "paymentWindowClosed" ||
    refusal === "pricingNotLive" ||
    (step === "payment" && classFareRappen == null);

  const hours = checkoutWindowHours(checkoutWindowMinutes);
  const currentIndex = step === "trip" ? 0 : step === "details" ? 1 : 2;
  const homeHref = localePath(locale, "/");
  const payClassUnpriced =
    step === "payment" &&
    quoteUnpriced(peekLockClassTotals(payLockToken).map((row) => row.total_rappen));
  const payLockPast = step === "payment" && (quoteLockZero || lockExpired(tripForPay));
  const paySheetAlert = payLockPast ? "quoteExpired" : payClassUnpriced ? "pricingNotLive" : null;
  const stripeMounted = Boolean(clientSecret);
  const showDummyFields = payClassUnpriced || (payLockPast && !stripeMounted);
  const payLocked = stripeMounted && payLockPast;

  async function onCheckoutRequote() {
    const trip = tripSnap ?? readVamosTrip();
    const quoteId = draft.quoteId || tripQuoteId(trip);
    if (!quoteId) return;
    try {
      const res = await fetch("/api/checkout/requote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quote_id: quoteId, quoteId }),
      });
      const json = (await res.json()) as { ok?: boolean };
      if (!res.ok || json.ok !== true) return;
      window.localStorage.removeItem("vamosTrip");
      window.sessionStorage.removeItem("vamosTrip");
      window.sessionStorage.removeItem("vamosQuoteLock");
      router.push(homeHref);
    } catch {
      return;
    }
  }

  const railPickup = placeText(tripSnap?.pickupPlace, pickup || draft.pickup);
  const railDrop = placeText(tripSnap?.dropoffPlace, destination || draft.destination);
  const lockToken = tripSnap?.lock || draft.lock;
  function extraPrice(row: CheckoutExtraJson): string {
    if (row.kind === "included") return tCommon("included-2");
    if (row.kind === "percent" && row.percent != null && String(row.percent) !== "") {
      return `+ ${String(row.percent)}%`;
    }
    if (row.kind === "amount" && row.amount_rappen != null) {
      const money = chfRappenToDisplay(row.amount_rappen, displayCur, fx.rates?.rates ?? null);
      return formatAmount(money.major, money.currency);
    }
    return "";
  }
  function extraOn(code: string): boolean {
    if (step === "trip") return false;
    const row = extrasCatalog.find((item) => item.code === code);
    if (row && (row.kind === "included" || row.toggle === false)) return true;
    return extraIsOn(code, {
      childSeat,
      oversized,
      extraStop,
      skiRack,
      extraCodes,
      meetGreet,
      freeWait,
      airportPickup: airportPickupFromPlace(pickupPlace) !== false,
    });
  }
  function extraClick(code: string) {
    if (code === "meet_greet") {
      const next = !meetGreet;
      setMeetGreet(next);
      writeVamosTrip({ meetGreet: next });
      return;
    }
    if (code === "free_wait") {
      const next = !freeWait;
      setFreeWait(next);
      writeVamosTrip({ freeWait: next });
      return;
    }
    if (code === "child_seat") {
      const next = !childSeat;
      setChildSeat(next);
      writeVamosTrip({ childSeat: next });
      void applyCouponCode(couponApplied, { childSeat: next, oversized, extraStop });
      return;
    }
    if (code === "oversized_luggage") {
      const next = !oversized;
      setOversized(next);
      writeVamosTrip({ oversizedLuggage: next });
      void applyCouponCode(couponApplied, { childSeat, oversized: next, extraStop });
      return;
    }
    if (code === "extra_stop") {
      const next = !extraStop;
      setExtraStop(next);
      writeVamosTrip({ stops: next ? 1 : 0 });
      if (!next) {
        setExtraStopText("");
        setExtraStopWaypoint(null);
      }
      void applyCouponCode(couponApplied, { extraStop: next }, next ? extraStopWaypoint : null);
      return;
    }
    if (code === "ski" || code === "ski_rack") {
      const next = !skiRack;
      setSkiRack(next);
      writeVamosTrip({ skiRack: next });
      return;
    }
    const next = extraCodes.includes(code)
      ? extraCodes.filter((row) => row !== code)
      : [...extraCodes, code];
    setExtraCodes(next);
    writeVamosTrip({ extrasOn: next });
  }
  const recapFareRows = recapExtraFares(extrasCatalog, extraOn);
  const extraGross = recapFareRows.reduce(
    (sum, row) => sum + (row.amount_rappen == null ? 0 : row.amount_rappen),
    0,
  );
  const classRappen = peekLockClassRappen(lockToken, paySlug || vehicle);
  const extraAdd = extraRappenOutsideLock(peekLockExtras(lockToken), extrasCatalog, extraOn);
  // D-08a: a percent coupon discounts checkout extras too. classRappen is
  // already post-coupon (the signed lock); wasRappen is the class total
  // from just before this coupon was applied — the same pre-coupon figure
  // payableRappen needs to gross checkout extras into the discount.
  const couponPercentHundredths =
    couponApplied && couponRule?.kind === "percent" ? couponRule.percentHundredths : null;
  const preCouponRappen = couponPercentHundredths != null ? wasRappen : null;
  const netRappen =
    classRappen == null
      ? null
      : payableRappen({
          classNetRappen: classRappen,
          preCouponRappen,
          extraAddRappen: extraAdd,
          couponPercent: couponPercentHundredths,
          vatRateBps,
        }).netRappen;
  const vatRappen = netRappen == null ? null : vatOnTopRappen(netRappen, vatRateBps);
  const chargedRappen =
    netRappen == null || vatRappen == null ? null : netRappen + vatRappen;
  const shown = chfRappenToDisplay(chargedRappen, displayCur, fx.rates?.rates ?? null);
  const fareRappen = netRappen == null ? null : Math.max(0, netRappen - extraGross);
  const vatShown = chfRappenToDisplay(vatRappen, displayCur, fx.rates?.rates ?? null);
  const wasNet =
    wasRappen != null && netRappen != null && wasRappen > netRappen ? wasRappen : null;
  const wasShown = chfRappenToDisplay(
    wasNet == null ? null : payableWithVatRappen(wasNet, vatRateBps),
    displayCur,
    fx.rates?.rates ?? null,
  );
  const recapExtraRows = recapExtras(extrasCatalog, extraOn);
  const fareShown = chfRappenToDisplay(fareRappen, displayCur, fx.rates?.rates ?? null);
  const couponOffRappen =
    couponApplied && wasNet != null && chargedRappen != null
      ? payableWithVatRappen(wasNet, vatRateBps) - chargedRappen
      : null;
  const couponOffShown = chfRappenToDisplay(couponOffRappen, displayCur, fx.rates?.rates ?? null);
  const priceLines =
    chargedRappen == null
      ? []
      : [
          { label: t("fareExVat"), amount: fareShown.major },
          ...recapFareRows
            .filter((row) => row.amount_rappen != null)
            .map((row) => {
              const money = chfRappenToDisplay(row.amount_rappen, displayCur, fx.rates?.rates ?? null);
              return {
                label: (
                  <span data-checkout-recap-extra={row.code}>
                    {`+ ${row.labelKey ? t(row.labelKey) : row.code.replace(/[_-]+/g, " ")}`}
                  </span>
                ),
                amount: money.major,
              };
            }),
          {
            label: (
              <span data-checkout-vat data-checkout-vat-amount={formatAmount(vatShown.major, vatShown.currency)}>
                {t("vatIncl")}
              </span>
            ),
            amount: vatShown.major,
          },
          ...(couponOffShown.major != null
            ? [
                {
                  label: (
                    <span
                      data-checkout-coupon-used
                      data-checkout-coupon-kind={couponRule?.kind}
                    >
                      {couponRule?.kind === "percent" && couponRule.percent
                        ? t("couponPercentOff", { percent: couponRule.percent })
                        : couponRule?.kind === "amount"
                          ? t("couponFixedOff")
                          : t("couponUsed")}
                    </span>
                  ),
                  amount: -couponOffShown.major,
                  credit: true as const,
                },
              ]
            : []),
        ];
  const priceWas = wasShown.major;
  const distanceM = peekLockDistanceM(lockToken);
  const distanceKm = distanceM == null ? null : formatDistanceKm(distanceM);
  const railMeta: RouteMetaItem[] = [
    ...(date
      ? [{ icon: "calendar" as const, label: <span className="vt-dir-keep">{formatRailDate(date, locale)}</span> }]
      : []),
    ...(time
      ? [{ icon: "clock" as const, label: <span className="vt-dir-keep">{time}</span> }]
      : []),
    ...(distanceKm
      ? [{ icon: "navigation" as const, label: <span className="vt-dir-keep">{t("distanceKm", { km: distanceKm })}</span> }]
      : []),
    { icon: "users", label: `${draft.passengers} ${tCommon("passengers")}` },
    { icon: "luggage", label: `${draft.luggage} ${tCommon("luggage")}` },
    ...recapExtraRows.map((row) => ({
      label: (
        <span data-checkout-recap-extra={row.code}>
          {row.labelKey ? t(row.labelKey) : row.code.replace(/[_-]+/g, " ")}
        </span>
      ),
    })),
  ];

  if (gate !== "ok") {
    return <div className="vt-checkout" data-checkout data-checkout-step={step} data-checkout-gate />;
  }

  return (
    <div className="vt-checkout" data-checkout data-checkout-step={step}>
      <div className="vt-checkout__top">
        <div className="vt-checkout__steps">
          <StepIndicator
            steps={[
              { label: t("checkoutStepTrip"), href: localePath(locale, checkoutStepPath("trip")) },
              { label: t("checkoutStepDetails"), href: localePath(locale, checkoutStepPath("details")) },
              { label: t("checkoutStepPayment"), href: localePath(locale, checkoutStepPath("payment")) },
            ]}
            current={currentIndex}
          />
        </div>
      </div>

      <div className="vt-checkout__grid">
        <div className="vt-checkout__main">
          {step === "trip" ? (
            <Card padding="lg">
              <h2>{t("yourTrip")}</h2>
              <div className="vt-checkout__trip">
                <div className="vt-checkout__place">
                  <PlaceCombo
                    label={tCommon("pickup")}
                    value={pickup}
                    placeholder={tHome("airport-address-or-hotel")}
                    icon="map-pin"
                    clearLabel={tCommon("clear")}
                    testField="pickup"
                    locale={geoLocale(locale)}
                    onChange={(v) => {
                      setPickup(v);
                      writeDraft({ pickup: v });
                    }}
                    onPlace={(place: PlaceRetrieve | null) => {
                      setPickupPlace(place);
                      if (place) {
                        setPickup(place.text.split(",")[0] ?? place.text);
                        writeDraft({ pickup: place.text });
                        writeVamosTrip({ pickup: place.text, pickupPlace: place });
                      }
                    }}
                    onClear={() => {
                      setPickup("");
                      setPickupPlace(null);
                      writeDraft({ pickup: "" });
                      writeVamosTrip({ pickup: "", pickupPlace: undefined });
                    }}
                  />
                </div>
                <div className="vt-checkout__place">
                  <PlaceCombo
                    label={tCommon("destination")}
                    value={destination}
                    placeholder={tHome("airport-address-or-hotel")}
                    icon="map-pin"
                    clearLabel={tCommon("clear")}
                    testField="destination"
                    locale={geoLocale(locale)}
                    onChange={(v) => {
                      setDestination(v);
                      writeDraft({ destination: v });
                    }}
                    onPlace={(place: PlaceRetrieve | null) => {
                      setDropoffPlace(place);
                      if (place) {
                        setDestination(place.text.split(",")[0] ?? place.text);
                        writeDraft({ destination: place.text });
                        writeVamosTrip({ dropoff: place.text, dropoffPlace: place });
                      }
                    }}
                    onClear={() => {
                      setDestination("");
                      setDropoffPlace(null);
                      writeDraft({ destination: "" });
                      writeVamosTrip({ dropoff: "", dropoffPlace: undefined });
                    }}
                  />
                </div>
                <div className="vt-checkout__when-split">
                  <WhenPicker
                    hideTime
                    label={tBooking("date")}
                    placeholder={tBooking("select-date-and-time")}
                    date={date}
                    time={time}
                    locale={locale}
                    groups={[tBooking("morning"), tBooking("afternoon"), tBooking("evening")]}
                    timeTitle={tCommon("pickup-time")}
                    savedLabel={tCommon("saved")}
                    clearLabel={tCommon("clear")}
                    saveLabel={tCommon("save")}
                    prevMonthLabel={tBooking("previous-month")}
                    nextMonthLabel={tBooking("next-month")}
                    onDateChange={(iso) => {
                      setDate(iso);
                      writeDraft({ date: iso });
                    }}
                    onTimeChange={(value) => {
                      setTime(value);
                      writeDraft({ time: value });
                    }}
                    onClear={() => {
                      setDate("");
                      writeDraft({ date: "" });
                    }}
                  />
                  <TimePicker
                    label={tBooking("time")}
                    timeTitle={tCommon("pickup-time")}
                    value={time}
                    placeholder={tBooking("time")}
                    onChange={(next) => {
                      setTime(next);
                      writeDraft({ time: next });
                    }}
                  />
                </div>
                <div className="vt-checkout__flight">
                  <FlightField
                    value={draft.flightNumber}
                    date={date}
                    onChange={(next) => {
                      writeDraft({ flightNumber: next });
                      writeVamosTrip({ flightNumber: next, flight: next });
                    }}
                  />
                </div>
                <div className="vt-checkout__party">
                  <Counter
                    label={tCommon("passengers")}
                    icon="users"
                    value={draft.passengers}
                    min={1}
                    max={7}
                    onChange={(value) => {
                      writeDraft({ passengers: value });
                      writeVamosTrip({ pax: value });
                    }}
                    decrementLabel={tAccount("one-passenger-fewer")}
                    incrementLabel={tAccount("one-passenger-more")}
                  />
                  <Counter
                    label={tCommon("luggage")}
                    icon="luggage"
                    value={draft.luggage}
                    min={0}
                    max={8}
                    onChange={(value) => {
                      writeDraft({ luggage: value });
                      writeVamosTrip({ bags: value });
                    }}
                    decrementLabel={tAccount("one-bag-fewer")}
                    incrementLabel={tAccount("one-bag-more")}
                  />
                </div>
              </div>
              <CheckoutClassCards
                vehicle={vehicle}
                passengers={draft.passengers}
                luggage={draft.luggage}
                offered={classOffersFromTrip(tripSnap)}
                lock={lockToken}
                onChange={(id) => {
                  setVehicle(id);
                  writeDraft({ vehicleClass: id });
                  writeVamosTrip({ vehicle: id });
                }}
              />
            </Card>
          ) : null}

          {step === "details" ? (
            <>
              <Card padding="lg">
                <h2>{t("who-is-travelling")}</h2>
                {signedIn ? (
                  <Tabs
                    className="vt-checkout__tabs"
                    block
                    data-checkout-who="signed"
                    value={forOther ? "other" : "self"}
                    onChange={(value) => {
                      if (value === "other") {
                        setForOther(true);
                        setContact(EMPTY_CONTACT);
                      } else {
                        setForOther(false);
                        if (accountContact) setContact(accountContact);
                      }
                    }}
                    items={[
                      { value: "self", label: t("myDetails") },
                      { value: "other", label: t("bookForSomeoneElse") },
                    ]}
                  />
                ) : (
                  <Tabs
                    className="vt-checkout__tabs"
                    block
                    data-checkout-who="guest"
                    value={guest ? "guest" : "account"}
                    onChange={(value) => setGuest(value === "guest")}
                    items={[
                      { value: "guest", label: t("continue-as-guest") },
                      { value: "account", label: tCommon("create-an-account") },
                    ]}
                  />
                )}
                <FlightField
                  value={draft.flightNumber}
                  date={date}
                  onChange={(next) => {
                    writeDraft({ flightNumber: next });
                    writeVamosTrip({ flightNumber: next, flight: next });
                  }}
                  onBlur={() => {
                    void syncFlightToLock();
                  }}
                />
                <ContactFields
                  value={contact}
                  errors={errors}
                  onChange={(patch) => setContact((c) => ({ ...c, ...patch }))}
                  emailHint={t("your-confirmation-and-voucher-go-here")}
                  mobileHint={t("the-driver-calls-this-number-on-arrival")}
                  labels={{
                    firstName: tCommon("first-name"),
                    lastName: tCommon("last-name"),
                    email: tCommon("email"),
                    mobile: tCommon("mobile"),
                  }}
                />
                {signedIn ? null : guest ? (
                  <p>{t("guestNoPassword")}</p>
                ) : (
                  <Input
                    label={tCommon("password")}
                    type="password"
                    required
                    value={password}
                    error={passwordError}
                    hint={tAuth("password-policy")}
                    autoComplete="new-password"
                    onChange={(e) => setPassword(e.target.value)}
                  />
                )}
              </Card>

              <Card padding="lg">
                <h2>{t("extras")}</h2>
                <div className="vt-checkout__extras">
                  {extrasCatalog.map((extra) => {
                    const ui = extraUi(extra.code);
                    const on = extraOn(extra.code);
                    const price = extraPrice(extra);
                    const label = ui ? t(ui.labelKey) : extra.code.replace(/_/g, " ");
                    const toggle = ui?.toggle ?? extra.toggle;
                    const copy = (
                      <span className="vt-checkout__extra-copy">
                        <strong>{label}</strong>
                        {price ? <span className="vt-checkout__extra-price">{price}</span> : null}
                      </span>
                    );
                    if (!toggle) {
                      return (
                        <div
                          key={extra.code}
                          className="vt-checkout__extra"
                          data-on="true"
                          data-static="true"
                        >
                          {copy}
                        </div>
                      );
                    }
                    return (
                      <button
                        key={extra.code}
                        type="button"
                        className="vt-checkout__extra"
                        data-on={on ? "true" : undefined}
                        aria-pressed={on}
                        onClick={() => extraClick(extra.code)}
                      >
                        {copy}
                      </button>
                    );
                  })}
                  {extraStop ? (
                    <div className="vt-checkout__place" data-checkout-extra-stop>
                      <PlaceCombo
                        label={t("additional-stop-2")}
                        value={extraStopText}
                        placeholder={tHome("airport-address-or-hotel")}
                        icon="map-pin"
                        clearLabel={tCommon("clear")}
                        testField="extra-stop"
                        locale={geoLocale(locale)}
                        onChange={(v) => {
                          setExtraStopText(v);
                          setExtraStopWaypoint(null);
                        }}
                        onPlace={(place: PlaceRetrieve | null) => {
                          if (!place) {
                            setExtraStopWaypoint(null);
                            return;
                          }
                          setExtraStopText(place.text.split(",")[0] ?? place.text);
                          void (async () => {
                            try {
                              const res = await fetch(
                                `/api/geo/retrieve?mapbox_id=${encodeURIComponent(place.mapbox_id)}` +
                                  `&session_token=${encodeURIComponent(place.session_token)}` +
                                  `&locale=${encodeURIComponent(geoLocale(locale))}`,
                                { credentials: "same-origin" },
                              );
                              const json = (await res.json()) as {
                                place?: { lng?: number; lat?: number } | null;
                              };
                              if (
                                typeof json.place?.lng === "number" &&
                                typeof json.place?.lat === "number"
                              ) {
                                const next = {
                                  lng: json.place.lng,
                                  lat: json.place.lat,
                                  text: place.text,
                                };
                                setExtraStopWaypoint(next);
                                void applyCouponCode(couponApplied, { extraStop: true }, next);
                              }
                            } catch {
                              setExtraStopWaypoint(null);
                            }
                          })();
                        }}
                        onClear={() => {
                          setExtraStopText("");
                          setExtraStopWaypoint(null);
                          void applyCouponCode(couponApplied, { extraStop: true }, null);
                        }}
                      />
                    </div>
                  ) : null}
                  <div className="vt-checkout__notes">
                    <Textarea
                      label={t("notes-for-the-driver")}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      hint={t("meeting-point-gate-code-ski-equipment")}
                    />
                  </div>
                </div>
              </Card>
            </>
          ) : null}

          {step === "payment" ? (
            <Card padding="lg">
              <div className="vt-checkout__sheet">
              <div className="vt-checkout__recap">
                <div className="vt-checkout__recap-trip">
                  <Badge tone="accent">{t("charged-now-secured-by-stripe")}</Badge>
                  <p className="vt-checkout__picked">{pickedClassName(paySlug || vehicle, tripForPay, t)}</p>
                  <RouteSummary pickup={railPickup} dropoff={railDrop} meta={railMeta} />
                </div>
                <div className="vt-checkout__recap-pay">
                  <div data-checkout-total>
                    <PriceSummary
                      lines={priceLines}
                      total={shown.major}
                      was={priceWas}
                      currency={shown.currency}
                      totalLabel={t("total")}
                    />
                  </div>
                  <div
                    className="vt-checkout__coupon"
                    data-checkout-coupon
                    data-coupon-state={couponApplied ? "valid" : couponInvalid ? "invalid" : undefined}
                  >
                    <Input
                      label={t("coupon-or-voucher-code")}
                      value={coupon}
                      placeholder={t("couponPlaceholder")}
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                      readOnly={Boolean(couponApplied)}
                      error={
                        couponInvalid ? (
                          <span data-checkout-coupon-msg>
                            {t(couponField ?? "couponNoLongerValid")}
                          </span>
                        ) : undefined
                      }
                      hint={
                        couponApplied && !couponInvalid ? (
                          <span data-checkout-coupon-msg>{t("couponAppliedOk")}</span>
                        ) : undefined
                      }
                      onChange={(e) => {
                        setCouponInvalid(false);
                        setCouponField(null);
                        setCoupon(e.target.value.toUpperCase());
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="md"
                      disabled={busy}
                      onClick={() =>
                        void applyCouponCode(couponApplied ? null : coupon.trim().toUpperCase() || null)
                      }
                    >
                      {couponApplied ? tCommon("remove") : tCommon("apply")}
                    </Button>
                  </div>
                  <p className="vt-checkout__charge" data-checkout-charge>
                    {t("chargeIn", { currency: t("chargeCurrencyName") })}
                  </p>
                </div>
              </div>
              <div className="vt-checkout__company">
                <h2 className="vt-checkout__company-title">{t("businessDetails")}</h2>
                <Input
                  label={t("companyName")}
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
                <Input
                  label={t("companyAddress")}
                  value={companyAddress}
                  onChange={(e) => setCompanyAddress(e.target.value)}
                />
                <Input
                  label={t("companyVat")}
                  value={companyVat}
                  onChange={(e) => setCompanyVat(e.target.value)}
                />
                <Input
                  label={t("payerEmail")}
                  value={payerEmail}
                  onChange={(e) => setPayerEmail(e.target.value)}
                />
              </div>
              <div className="vt-checkout__payblock">
                {paySheetAlert ? (
                  <Alert role="alert" tone={paySheetAlert === "pricingNotLive" ? "info" : "danger"}>
                    <span style={{ display: "flex", flexWrap: "wrap", whiteSpace: "normal" }}>
                      {t(paySheetAlert)}
                      <Button
                        variant="ghost"
                        size="md"
                        sentenceCase
                        style={{ whiteSpace: "normal" }}
                        onClick={() => void onCheckoutRequote()}
                      >
                        {t("requote")}
                      </Button>
                    </span>
                  </Alert>
                ) : null}
                <div className="vt-checkout__payhead">
                  <h2>{t("payment")}</h2>
                  <p>{t("card-apple-pay-or-twint")}</p>
                </div>
                <div className="vt-checkout__paystack">
                  {!clientSecret && refusal && refusal !== paySheetAlert ? (
                    <p data-checkout-card-status="error" role="alert">
                      {t(refusal)}
                    </p>
                  ) : null}
                  {showDummyFields ? (
                    <div className="vt-checkout__cardblock">
                      <h2 className="vt-checkout__method">
                        <Icon name="credit-card" size={16} />
                        {t("payWithCard")}
                      </h2>
                      <div className="vt-checkout__cardfields" data-checkout-dummy-fields>
                        <Input
                          size="md"
                          disabled
                          label={t("cardNumber")}
                          value=""
                          placeholder="1234 1234 1234 1234"
                          onChange={() => undefined}
                        />
                        <Select
                          size="md"
                          disabled
                          label={t("cardCountry")}
                          value="CH"
                          options={[{ value: "CH", label: "CH" }]}
                          onChange={() => undefined}
                        />
                        <Input
                          size="md"
                          disabled
                          label={t("cardExpiry")}
                          value=""
                          placeholder="MM / YY"
                          onChange={() => undefined}
                        />
                        <Input
                          size="md"
                          disabled
                          label={t("cardCvc")}
                          value=""
                          placeholder="CVC"
                          onChange={() => undefined}
                        />
                      </div>
                    </div>
                  ) : (
                  <PaymentPanel
                    locked={payLocked}
                    publishableKey={publishable}
                    clientSecret={clientSecret ?? ""}
                    clientSecretHex={clientSecretHex}
                    reference={reference ?? ""}
                    billingName={`${contact.firstName} ${contact.lastName}`.trim()}
                    billingEmail={contact.email}
                    billingPhone={contact.mobile}
                    onReady={onPaymentReady}
                    onComplete={onPaymentComplete}
                  />
                  )}
                </div>
              </div>
              <div className="vt-checkout__payfoot">
                {freeCancelHours != null ? (
                  <p>{t("freeCancelHours", { hours: freeCancelHours })}</p>
                ) : (
                  <p>
                    <span data-tok>{t("cancel-free-of-charge-up-to-24-hours-before-pick")}</span>
                  </p>
                )}
                {payError ? <Alert tone="danger">{payError}</Alert> : null}
                {refusal &&
                refusal !== "couponNoLongerValid" &&
                refusal !== paySheetAlert ? (
                  <Alert tone={refusal === "pricingNotLive" ? "info" : "danger"}>
                    {refusal === "priceChanged" && hours != null
                      ? t("livePriceChangedLocked", { hours })
                      : t(refusal)}
                    {requote ? (
                      <Button variant="ghost" size="sm" href={homeHref}>
                        {t("requote")}
                      </Button>
                    ) : null}
                  </Alert>
                ) : null}
                <div className="vt-checkout__cta" aria-busy={busy || undefined}>
                  <Button
                    size="lg"
                    disabled={busy || classFareRappen == null || Boolean(paySheetAlert) || payLocked}
                    onClick={() => void onPay()}
                  >
                    {t("pay-and-continue")}
                  </Button>
                  <Button
                    size="lg"
                    disabled={busy || classFareRappen == null || Boolean(paySheetAlert) || payLocked || !isCheckoutEmail(payerEmail)}
                    onClick={() => void sendPayLink()}
                  >
                    {t("sendPayLink")}
                  </Button>
                </div>
                {payUrl ? (
                  <div className="vt-checkout__payresult" role="status" data-checkout-pay-result>
                    <p>{t("payLinkSent")}</p>
                    {reference ? <p>{t("unpaidReference", { reference })}</p> : null}
                    <div className="vt-checkout__paylink">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          void navigator.clipboard.writeText(payUrl);
                        }}
                      >
                        {t("copyPayLink")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        href={`https://wa.me/?text=${encodeURIComponent(payUrl)}`}
                      >
                        {t("whatsappPayLink")}
                      </Button>
                    </div>
                  </div>
                ) : null}
                <p className="vt-checkout__terms">
                  <Icon name="shield-check" size={16} /> {t("by-continuing-you-accept-the-terms-and-the-cance")}
                </p>
                {hours != null ? (
                  <p className="vt-checkout__charge">{t("checkoutWindowHours", { hours })}</p>
                ) : checkoutWindowMinutes != null ? (
                  <p className="vt-checkout__charge">{t("checkoutWindow", { minutes: checkoutWindowMinutes })}</p>
                ) : null}
              </div>
              </div>
            </Card>
          ) : null}
        </div>

        {step !== "payment" ? (
        <aside className="vt-checkout__rail" data-checkout-rail>
          <Card padding="lg">
            <Badge tone="accent">{t("charged-now-secured-by-stripe")}</Badge>
            <p className="vt-checkout__picked">{vehicleLabel(vehicle, t)}</p>
            <RouteSummary pickup={railPickup} dropoff={railDrop} meta={railMeta} />
            <div data-checkout-total>
              <PriceSummary
                lines={priceLines}
                total={shown.major}
                was={priceWas}
                currency={shown.currency}
                totalLabel={t("total")}
              />
            </div>
            {distanceKm ? (
              <p className="vt-checkout__charge" data-checkout-distance>
                {t("distanceKm", { km: distanceKm })}
              </p>
            ) : null}
            <p className="vt-checkout__charge" data-checkout-charge>
              {t("chargeIn", { currency: t("chargeCurrencyName") })}
            </p>
            {freeCancelHours != null ? (
              <p>{t("freeCancelHours", { hours: freeCancelHours })}</p>
            ) : (
              <p>
                <span data-tok>{t("cancel-free-of-charge-up-to-24-hours-before-pick")}</span>
              </p>
            )}
            {payError ? <Alert tone="danger">{payError}</Alert> : null}
            {refusal && !paySheetAlert && refusal !== "couponNoLongerValid" ? (
              <Alert tone={refusal === "pricingNotLive" ? "info" : "danger"}>
                {refusal === "priceChanged" && hours != null
                  ? t("livePriceChangedLocked", { hours })
                  : t(refusal)}
                {requote ? (
                  <Button variant="ghost" size="sm" href={homeHref}>
                    {t("requote")}
                  </Button>
                ) : null}
              </Alert>
            ) : null}
            {step === "trip" ? (
              <Button size="lg" block disabled={busy} onClick={() => void continueTrip()}>
                {t("continue")}
              </Button>
            ) : null}
            {step === "details" ? (
              <Button size="lg" block disabled={busy} onClick={() => void continueDetails()}>
                {t("continue")}
              </Button>
            ) : null}
            <p className="vt-checkout__terms">
              <Icon name="shield-check" size={16} /> {t("by-continuing-you-accept-the-terms-and-the-cance")}
            </p>
            {hours != null ? (
              <p className="vt-checkout__charge">{t("checkoutWindowHours", { hours })}</p>
            ) : checkoutWindowMinutes != null ? (
              <p className="vt-checkout__charge">{t("checkoutWindow", { minutes: checkoutWindowMinutes })}</p>
            ) : null}
          </Card>
        </aside>
        ) : null}
      </div>
    </div>
  );
}
