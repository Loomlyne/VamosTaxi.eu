"use client";

import { useCallback, useEffect, useState } from "react";
import { createNavigation } from "next-intl/navigation";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/feedback/Alert";
import { Badge, Button, Card, Icon, Tag } from "@/components/core";
import { Counter, Input, Textarea, WhenPicker, TimePicker } from "@/components/forms";
import { StepIndicator } from "@/components/navigation/StepIndicator";
import { Tabs } from "@/components/navigation/Tabs";
import { PriceSummary, RouteSummary, type RouteMetaItem } from "@/components/transfer";
import {
  ContactFields,
  type ContactFieldsErrors,
  type ContactFieldsValue,
} from "@/components/booking";
import { TurnstileWidget } from "@/components/forms/TurnstileWidget";
import { PlaceCombo, type PlaceRetrieve } from "@/components/forms/PlaceCombo";
import { e164Phone, isCheckoutEmail } from "@/lib/checkout/contact-validate";
import { useBookingDraft } from "@/lib/booking-draft";
import {
  bouncePath,
  checkoutStepPath,
  checkoutWindowHours,
  hasQuoteLock,
  localePath,
  type CheckoutStep,
} from "@/lib/checkout/steps";
import {
  formatRailDate,
  geoLocale,
  peekLockClassRappen,
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
import { companyReady } from "@/lib/checkout/pay-link";
import { chfRappenToDisplay } from "@/lib/fx/format";
import { useFx } from "@/lib/fx/use-fx";
import { useVamosLocale } from "@/lib/locale-shim";
import type { CurrencyCode } from "@/lib/currency";
import { routing } from "@/i18n/routing";
import { useCheckoutSettings } from "./CheckoutSettings";
import { CheckoutClassCards } from "./CheckoutClassCards";
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
  turnstile_failed: "formChallengeFailed",
};

function vehicleLabel(id: string, t: (key: string) => string): string {
  if (id === "economy") return t("classEconomy");
  if (id === "business") return t("classBusiness");
  if (id === "first") return t("classFirst");
  if (id === "van") return t("classVan");
  return t("vehicleClassFallback");
}

const CLASS_SLUGS = ["economy", "business", "first", "van"] as const;

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
  const fromTrip = trip?.classes?.filter((id) => CLASS_SLUGS.includes(id as (typeof CLASS_SLUGS)[number]));
  if (fromTrip && fromTrip.length > 0) return fromTrip;
  return [...CLASS_SLUGS];
}

function asDisplayCurrency(cur: string): CurrencyCode {
  if (cur === "EUR" || cur === "USD" || cur === "AED") return cur;
  return "CHF";
}

export function CheckoutClient({ step }: CheckoutClientProps) {
  const { locale, freeCancelHours, checkoutWindowMinutes, turnstileSiteKey, publishableKey } =
    useCheckoutSettings();
  const t = useTranslations("checkout");
  const tCommon = useTranslations("common");
  const tBooking = useTranslations("booking");
  const tHome = useTranslations("home");
  const tAccount = useTranslations("account");
  const tAuth = useTranslations("auth");
  const tQuote = useTranslations("quote");
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
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [airline, setAirline] = useState("");
  const [notes, setNotes] = useState("");
  const [childSeat, setChildSeat] = useState(false);
  const [oversized, setOversized] = useState(false);
  const [coupon, setCoupon] = useState("");
  const [couponApplied, setCouponApplied] = useState<string | null>(null);
  const [turnstile, setTurnstile] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishable, setPublishable] = useState(publishableKey);
  const [reference, setReference] = useState<string | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [billingKind, setBillingKind] = useState<"individual" | "company">("individual");
  const [payMethod, setPayMethod] = useState<"card" | "link">("card");
  const [companyName, setCompanyName] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyVat, setCompanyVat] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [confirmPay, setConfirmPay] = useState<(() => Promise<void>) | null>(null);
  const [tripSnap, setTripSnap] = useState<VamosTrip | null>(null);

  const onPaymentReady = useCallback((fn: () => Promise<void>) => {
    setConfirmPay(() => fn);
  }, []);

  useEffect(() => {
    const trip = readVamosTrip();
    const bounce = bouncePath(step, trip);
    if (bounce) {
      router.replace(bounce);
      return;
    }
    setTripSnap(trip);
    const nextPickup = tripPickup(trip);
    const nextDrop = tripDropoff(trip);
    const nextVehicle = tripVehicle(trip);
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
    if (typeof trip?.childSeat === "boolean") setChildSeat(trip.childSeat);
    if (typeof trip?.oversizedLuggage === "boolean") setOversized(trip.oversizedLuggage);
    if (trip?.billingKind === "company" || trip?.billingKind === "individual") {
      setBillingKind(trip.billingKind);
    }
    writeDraft({
      pickup: nextPickup,
      destination: nextDrop,
      date: nextDate,
      time: nextTime,
      passengers: tripPax(trip),
      luggage: tripBags(trip),
      flightNumber: trip?.flightNumber || trip?.flight || "",
      quoteId: tripQuoteId(trip) || undefined,
      lock: trip?.lock || undefined,
      vehicleClass: nextVehicle,
    });
    setGate("ok");
  }, [step, router, writeDraft]);

  useEffect(() => {
    if (!draft.quoteId) return;
    if (draft.idempotencyKey) return;
    // Mint once per quote. A new idempotency_key per Pay click would raise
    // quote_already_booked on retry (plan 07-02). Reload and card retry reuse it.
    writeDraft({ idempotencyKey: crypto.randomUUID() });
  }, [draft.quoteId, draft.idempotencyKey, writeDraft]);

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
          pickup: pickupPlace,
          dropoff: dropoffPlace,
          legs: [{ leg_seq: 1, scheduled_local: scheduled, flight_no: draft.flightNumber || null }],
          pax: Math.max(1, draft.passengers),
          bags: Math.max(0, draft.luggage),
          preferred_class: CLASS_SLUGS.includes(vehicle as (typeof CLASS_SLUGS)[number])
            ? vehicle
            : undefined,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        quote_id?: string;
        lock?: string;
        expires_at?: string;
        classes?: { slug?: string; total_rappen?: number | null }[];
      };
      if (!res.ok || json.ok !== true || !json.quote_id || !json.lock) {
        setRefusal("quoteExpired");
        return;
      }
      const priced = (json.classes ?? [])
        .filter((c) => c.slug && c.total_rappen != null)
        .map((c) => c.slug as string);
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
        pickupPlace,
        dropoffPlace,
        display_currency: displayCur,
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
    if (!validate()) return;
    setPasswordError(undefined);
    if (!guest) {
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
      billingKind,
      flightNumber: draft.flightNumber,
    });
    router.push(checkoutStepPath("payment"));
  }

  async function startPayment() {
    if (!validate()) return;
    const trip = tripSnap ?? readVamosTrip();
    const quoteId = draft.quoteId || tripQuoteId(trip);
    const lock = draft.lock || trip?.lock;
    const vehicleClass = draft.vehicleClass || vehicle;
    const idempotencyKey = draft.idempotencyKey;
    if (!quoteId || !lock || !vehicleClass || !idempotencyKey) {
      setRefusal("quoteExpired");
      return;
    }
    setBusy(true);
    setRefusal(null);
    try {
      const res = await fetch("/api/checkout/intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          quote_id: quoteId,
          lock,
          vehicle_class: vehicleClass,
          extras: {
            child_seats: childSeat ? 1 : 0,
            oversized_luggage: oversized,
          },
          coupon: couponApplied,
          contact: {
            name: `${contact.firstName.trim()} ${contact.lastName.trim()}`,
            email: contact.email.trim(),
            phone: contact.mobile.trim(),
          },
          locale,
          display_currency: displayCur,
          idempotency_key: idempotencyKey,
          ...(turnstile ? { turnstile_token: turnstile } : {}),
        }),
      });
      const json = (await res.json()) as {
        client_secret?: string;
        publishable_key?: string;
        reference?: string;
        code?: string;
      };
      if (!res.ok) {
        const key = REFUSAL_KEYS[json.code ?? ""] ?? "formChallengeFailed";
        if (json.code === "coupon_no_longer_valid") setCouponApplied(null);
        setRefusal(key);
        return;
      }
      if (json.publishable_key) setPublishable(json.publishable_key);
      if (json.reference) setReference(json.reference);
      setClientSecret(json.client_secret ?? null);
    } catch {
      setRefusal("formChallengeFailed");
    } finally {
      setBusy(false);
    }
  }

  async function sendPayLink() {
    if (!validate()) return;
    if (
      billingKind === "company" &&
      !companyReady({ kind: "company", name: companyName, address: companyAddress, vat: companyVat })
    ) {
      setRefusal("quoteExpired");
      return;
    }
    const trip = tripSnap ?? readVamosTrip();
    const quoteId = draft.quoteId || tripQuoteId(trip);
    const lock = draft.lock || trip?.lock;
    const vehicleClass = draft.vehicleClass || vehicle;
    const idempotencyKey = draft.idempotencyKey;
    if (!quoteId || !lock || !vehicleClass || !idempotencyKey) {
      setRefusal("quoteExpired");
      return;
    }
    const payer = (payerEmail || contact.email).trim();
    if (!payer) {
      setRefusal("quoteExpired");
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
          extras: {
            child_seats: childSeat ? 1 : 0,
            oversized_luggage: oversized,
          },
          coupon: couponApplied,
          contact: {
            name: `${contact.firstName.trim()} ${contact.lastName.trim()}`,
            email: contact.email.trim(),
            phone: contact.mobile.trim(),
          },
          locale,
          display_currency: displayCur,
          idempotency_key: idempotencyKey,
          ...(turnstile ? { turnstile_token: turnstile } : {}),
          billing_kind: billingKind,
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
      };
      if (!res.ok) {
        const key = REFUSAL_KEYS[json.code ?? ""] ?? "formChallengeFailed";
        setRefusal(key);
        return;
      }
      if (json.reference) setReference(json.reference);
      if (json.pay_url) setPayUrl(json.pay_url);
    } catch {
      setRefusal("formChallengeFailed");
    } finally {
      setBusy(false);
    }
  }

  async function onPay() {
    if (clientSecret && confirmPay) {
      setBusy(true);
      try {
        await confirmPay();
      } catch {
        // Panel shows the Stripe error. Booking is not confirmed here (D-16).
      } finally {
        setBusy(false);
      }
      return;
    }
    await startPayment();
  }

  const requote =
    refusal === "quoteExpired" ||
    refusal === "priceChanged" ||
    refusal === "engineChanged" ||
    refusal === "paymentWindowClosed";

  const hours = checkoutWindowHours(checkoutWindowMinutes);
  const currentIndex = step === "trip" ? 0 : step === "details" ? 1 : 2;
  const homeHref = localePath(locale, "/");
  const railPickup = placeText(tripSnap?.pickupPlace, pickup || draft.pickup);
  const railDrop = placeText(tripSnap?.dropoffPlace, destination || draft.destination);
  const lockToken = tripSnap?.lock || draft.lock;
  const shown = chfRappenToDisplay(
    peekLockClassRappen(lockToken, vehicle),
    displayCur,
    fx.rates?.rates ?? null,
  );
  const railMeta: RouteMetaItem[] = [
    ...(date
      ? [{ icon: "calendar" as const, label: <span className="vt-dir-keep">{formatRailDate(date, locale)}</span> }]
      : []),
    ...(time
      ? [{ icon: "clock" as const, label: <span className="vt-dir-keep">{time}</span> }]
      : []),
    { icon: "users", label: `${draft.passengers} ${tCommon("passengers")}` },
    { icon: "luggage", label: `${draft.luggage} ${tCommon("luggage")}` },
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
                  <Input
                    label={tCommon("flight-number")}
                    icon="plane"
                    value={draft.flightNumber}
                    placeholder={tQuote("flight.placeholder")}
                    onChange={(e) => writeDraft({ flightNumber: e.target.value })}
                  />
                </div>
                <div className="vt-checkout__party">
                  <Counter
                    label={tCommon("passengers")}
                    icon="users"
                    value={draft.passengers}
                    min={1}
                    max={8}
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
                classes={classList(tripSnap)}
                vehicle={vehicle}
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
                <Tabs
                  className="vt-checkout__tabs"
                  block
                  value={guest ? "guest" : "account"}
                  onChange={(value) => setGuest(value === "guest")}
                  items={[
                    { value: "guest", label: t("continue-as-guest") },
                    { value: "account", label: tCommon("create-an-account") },
                  ]}
                />
                <Input
                  label={tCommon("flight-number")}
                  icon="plane"
                  value={draft.flightNumber}
                  placeholder={tQuote("flight.placeholder")}
                  onChange={(e) => writeDraft({ flightNumber: e.target.value })}
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
                {guest ? (
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
                  <button
                    type="button"
                    className="vt-checkout__extra"
                    data-on={childSeat ? "true" : undefined}
                    aria-pressed={childSeat}
                    onClick={() => setChildSeat((v) => !v)}
                  >
                    <Icon name="baby" size={20} />
                    <span className="vt-checkout__extra-copy">
                      <strong>{t("childSeat")}</strong>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="vt-checkout__extra"
                    data-on={oversized ? "true" : undefined}
                    aria-pressed={oversized}
                    onClick={() => setOversized((v) => !v)}
                  >
                    <Icon name="luggage" size={20} />
                    <span className="vt-checkout__extra-copy">
                      <strong>{t("extraOversized")}</strong>
                    </span>
                  </button>
                  <div className="vt-checkout__notes">
                    <Textarea
                      label={t("notes-for-the-driver")}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      hint={t("meeting-point-gate-code-ski-equipment")}
                    />
                    <p className="vt-checkout__included">{t("arrivals-your-driver-waits-with-your-name")}</p>
                  </div>
                </div>
              </Card>
            </>
          ) : null}

          {step === "payment" ? (
            <Card padding="lg">
              <div className="vt-checkout__payhead">
                <h2>{t("payment")}</h2>
                <p>{t("card-apple-pay-or-twint")}</p>
              </div>
              <div className="vt-checkout__payblock">
                <Tabs
                  className="vt-checkout__tabs"
                  block
                  value={billingKind}
                  onChange={(value) => setBillingKind(value === "company" ? "company" : "individual")}
                  items={[
                    { value: "individual", label: t("billingIndividual") },
                    { value: "company", label: t("billingCompany") },
                  ]}
                />
                {billingKind === "company" ? (
                  <div className="vt-checkout__company">
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
                  </div>
                ) : null}
              </div>
              <div className="vt-checkout__payblock">
                <Tabs
                  className="vt-checkout__tabs"
                  block
                  value={payMethod}
                  onChange={(value) => setPayMethod(value === "link" ? "link" : "card")}
                  items={[
                    { value: "card", label: t("payNow") },
                    { value: "link", label: t("payLinkTab") },
                  ]}
                />
                <div className="vt-checkout__paystack">
                  {payMethod === "link" ? (
                    <>
                      <Input
                        label={t("payerEmail")}
                        value={payerEmail || contact.email}
                        onChange={(e) => setPayerEmail(e.target.value)}
                      />
                      {payUrl ? (
                        <>
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
                        </>
                      ) : (
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void sendPayLink()}>
                          {t("sendPayLink")}
                        </Button>
                      )}
                    </>
                  ) : (
                    <>
                      <p>{t("charged-now-secured-by-stripe")}</p>
                      {busy && !clientSecret ? <div data-checkout-pay-skeleton aria-hidden="true" /> : null}
                      {clientSecret && reference ? (
                        <PaymentPanel
                          publishableKey={publishable}
                          clientSecret={clientSecret}
                          reference={reference}
                          onReady={onPaymentReady}
                        />
                      ) : (
                        <TurnstileWidget
                          siteKey={turnstileSiteKey}
                          action="checkout"
                          onToken={setTurnstile}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            </Card>
          ) : null}
        </div>

        <aside className="vt-checkout__rail" data-checkout-rail>
          <Card padding="lg">
            <Badge tone="accent">{t("charged-now-secured-by-stripe")}</Badge>
            <p className="vt-checkout__picked">{vehicleLabel(vehicle, t)}</p>
            <RouteSummary pickup={railPickup} dropoff={railDrop} meta={railMeta} />
            <div data-checkout-total>
              <PriceSummary
                total={shown.major}
                currency={shown.currency}
                totalLabel={t("total")}
              />
            </div>
            {step === "payment" ? (
              <div className="vt-checkout__coupon" data-checkout-coupon>
                <Input
                  label={t("coupon-or-voucher-code")}
                  value={coupon}
                  placeholder={t("couponPlaceholder")}
                  onChange={(e) => setCoupon(e.target.value)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCouponApplied(coupon.trim() || null)}
                >
                  {tCommon("apply")}
                </Button>
              </div>
            ) : null}
            {couponApplied ? (
              <Tag onRemove={() => setCouponApplied(null)}>
                {t("couponCode", { code: couponApplied })}
              </Tag>
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
            {refusal && refusal !== "pricingNotLive" ? (
              <Alert tone={refusal === "pricingNotLive" ? "info" : "danger"}>
                {refusal === "formChallengeFailed"
                  ? tCommon("form-challenge-failed")
                  : refusal === "priceChanged" && hours != null
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
            {step === "payment" ? (
              <div className="vt-checkout__cta">
                <Button size="lg" block disabled={busy} onClick={() => void onPay()}>
                  {t("pay-and-confirm")}
                </Button>
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
          </Card>
        </aside>
      </div>
    </div>
  );
}
