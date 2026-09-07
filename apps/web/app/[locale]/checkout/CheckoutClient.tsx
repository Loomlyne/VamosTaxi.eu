"use client";

import { useCallback, useEffect, useState } from "react";
import { createNavigation } from "next-intl/navigation";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/feedback/Alert";
import { Badge, Button, Card, Icon, Tag } from "@/components/core";
import { Checkbox, Counter, Input, Radio, Textarea } from "@/components/forms";
import { StepIndicator } from "@/components/navigation/StepIndicator";
import { PriceSummary, RouteSummary } from "@/components/transfer";
import { ContactFields, type ContactFieldsErrors, type ContactFieldsValue } from "@/components/booking";
import { TurnstileWidget } from "@/components/forms/TurnstileWidget";
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
  readVamosTrip,
  tripDropoff,
  tripPickup,
  tripQuoteId,
  tripVehicle,
  writeVamosTrip,
  type VamosTrip,
} from "@/lib/checkout/vamos-trip";
import { companyReady } from "@/lib/checkout/pay-link";
import { routing } from "@/i18n/routing";
import { useCheckoutSettings } from "./CheckoutSettings";
import { PaymentPanel } from "./PaymentPanel";

const { useRouter } = createNavigation(routing);

export type CheckoutClientProps = {
  step: CheckoutStep;
};

const REFUSAL_KEYS: Record<string, string> = {
  quote_expired: "quoteExpired",
  price_changed: "priceChanged",
  engine_changed: "engineChanged",
  pricing_not_live: "pricingNotLive",
  coupon_no_longer_valid: "couponNoLongerValid",
  quote_already_booked: "quoteAlreadyBooked",
  payment_window_closed: "paymentWindowClosed",
};

const CLASS_SLUGS = ["economy", "business", "first", "van"] as const;

const CLASS_KEYS: Record<(typeof CLASS_SLUGS)[number], "classEconomy" | "classBusiness" | "classFirst" | "classVan"> = {
  economy: "classEconomy",
  business: "classBusiness",
  first: "classFirst",
  van: "classVan",
};

function scheduledLocalFor(trip: VamosTrip | null, date: string, time: string): string | null {
  const base = trip?.scheduled_local;
  if (time && /^\d{2}:\d{2}$/.test(time) && base && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(base)) {
    return `${base.slice(0, 10)}T${time}`;
  }
  if (base && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(base)) return base;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time)) return `${date}T${time}`;
  return null;
}

function classList(trip: VamosTrip | null): string[] {
  const fromTrip = trip?.classes?.filter((id) => CLASS_SLUGS.includes(id as (typeof CLASS_SLUGS)[number]));
  if (fromTrip && fromTrip.length > 0) return fromTrip;
  return [...CLASS_SLUGS];
}

export function CheckoutClient({ step }: CheckoutClientProps) {
  const { locale, freeCancelHours, checkoutWindowMinutes, turnstileSiteKey, publishableKey } =
    useCheckoutSettings();
  const t = useTranslations("checkout");
  const tCommon = useTranslations("common");
  const tBooking = useTranslations("booking");
  const router = useRouter();
  const [draft, writeDraft] = useBookingDraft();

  const [gate, setGate] = useState<"check" | "ok">("check");
  const [pickup, setPickup] = useState("");
  const [destination, setDestination] = useState("");
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
  const [airline, setAirline] = useState("");
  const [notes, setNotes] = useState("");
  const [childSeat, setChildSeat] = useState(false);
  const [stops, setStops] = useState(0);
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
    const nextDate = trip?.date ?? "";
    const nextTime = trip?.time ?? "";
    setPickup(nextPickup);
    setDestination(nextDrop);
    setDate(nextDate);
    setTime(nextTime);
    setVehicle(nextVehicle);
    if (trip?.contact) {
      setContact(trip.contact);
      setPayerEmail((email) => email || trip.contact?.email || "");
    }
    if (typeof trip?.guest === "boolean") setGuest(trip.guest);
    if (trip?.airline) setAirline(trip.airline);
    if (trip?.notes) setNotes(trip.notes);
    if (typeof trip?.childSeat === "boolean") setChildSeat(trip.childSeat);
    if (typeof trip?.stops === "number") setStops(trip.stops);
    writeDraft({
      pickup: nextPickup,
      destination: nextDrop,
      date: nextDate,
      time: nextTime,
      passengers: trip?.pax ?? trip?.passengers ?? 1,
      luggage: trip?.bags ?? trip?.luggage ?? 0,
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
    if (!contact.mobile.trim()) next.mobile = t("enter-a-mobile-number");
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function continueTrip() {
    const trip = readVamosTrip();
    const edited =
      pickup !== tripPickup(trip) ||
      destination !== tripDropoff(trip) ||
      date !== (trip?.date ?? "") ||
      time !== (trip?.time ?? "") ||
      vehicle !== tripVehicle(trip);
    if (hasQuoteLock(trip) && !edited) {
      writeVamosTrip({ pickup, dropoff: destination, date, time, vehicle });
      router.push(checkoutStepPath("details"));
      return;
    }
    await relockTrip();
  }

  async function relockTrip() {
    const trip = readVamosTrip();
    const pickupPlace = trip?.pickupPlace;
    const dropoffPlace = trip?.dropoffPlace;
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
          display_currency: trip?.display_currency || "CHF",
          mode: "one_way",
          pickup: pickupPlace,
          dropoff: dropoffPlace,
          legs: [{ leg_seq: 1, scheduled_local: scheduled, flight_no: draft.flightNumber || null }],
          pax: Math.max(1, trip?.pax ?? draft.passengers ?? 1),
          bags: Math.max(0, trip?.bags ?? draft.luggage ?? 0),
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

  function continueDetails() {
    if (!validate()) return;
    writeVamosTrip({
      detailsComplete: true,
      contact,
      guest,
      airline,
      notes,
      childSeat,
      stops,
      flightNumber: draft.flightNumber,
    });
    router.push(checkoutStepPath("payment"));
  }

  async function startPayment() {
    if (!validate()) return;
    if (!draft.quoteId || !draft.lock || !draft.vehicleClass || !draft.idempotencyKey) {
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
          quote_id: draft.quoteId,
          lock: draft.lock,
          vehicle_class: draft.vehicleClass,
          extras: {
            child_seats: childSeat ? 1 : 0,
            extra_stops: stops,
          },
          coupon: couponApplied,
          contact: {
            name: `${contact.firstName.trim()} ${contact.lastName.trim()}`,
            email: contact.email.trim(),
            phone: contact.mobile.trim(),
          },
          locale,
          display_currency: "CHF",
          idempotency_key: draft.idempotencyKey,
          turnstile_token: turnstile,
        }),
      });
      const json = (await res.json()) as {
        client_secret?: string;
        publishable_key?: string;
        reference?: string;
        code?: string;
      };
      if (!res.ok) {
        const key = REFUSAL_KEYS[json.code ?? ""] ?? "quoteExpired";
        if (json.code === "coupon_no_longer_valid") setCouponApplied(null);
        setRefusal(key);
        return;
      }
      if (json.publishable_key) setPublishable(json.publishable_key);
      if (json.reference) setReference(json.reference);
      setClientSecret(json.client_secret ?? null);
    } catch {
      setRefusal("quoteExpired");
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
    if (!draft.quoteId || !draft.lock || !draft.vehicleClass || !draft.idempotencyKey) {
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
          quote_id: draft.quoteId,
          lock: draft.lock,
          vehicle_class: draft.vehicleClass,
          extras: {
            child_seats: childSeat ? 1 : 0,
            extra_stops: stops,
          },
          coupon: couponApplied,
          contact: {
            name: `${contact.firstName.trim()} ${contact.lastName.trim()}`,
            email: contact.email.trim(),
            phone: contact.mobile.trim(),
          },
          locale,
          display_currency: "CHF",
          idempotency_key: draft.idempotencyKey,
          turnstile_token: turnstile,
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
        const key = REFUSAL_KEYS[json.code ?? ""] ?? "quoteExpired";
        setRefusal(key);
        return;
      }
      if (json.reference) setReference(json.reference);
      if (json.pay_url) setPayUrl(json.pay_url);
    } catch {
      setRefusal("quoteExpired");
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
  const railPickup = pickup || draft.pickup;
  const railDrop = destination || draft.destination;

  if (gate !== "ok") {
    return <div className="vt-checkout" data-checkout data-checkout-step={step} data-checkout-gate />;
  }

  return (
    <div className="vt-checkout" data-checkout data-checkout-step={step}>
      <div className="vt-checkout__top">
        <Button variant="ghost" size="sm" icon="chevron-left" href={homeHref}>
          {t("change-vehicle")}
        </Button>
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
              <Input
                label={tCommon("pickup")}
                value={pickup}
                onChange={(e) => {
                  setPickup(e.target.value);
                  writeDraft({ pickup: e.target.value });
                }}
              />
              <Input
                label={tCommon("destination")}
                value={destination}
                onChange={(e) => {
                  setDestination(e.target.value);
                  writeDraft({ destination: e.target.value });
                }}
              />
              <Input
                label={tBooking("date")}
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  writeDraft({ date: e.target.value });
                }}
              />
              <Input
                label={tBooking("time")}
                value={time}
                onChange={(e) => {
                  setTime(e.target.value);
                  writeDraft({ time: e.target.value });
                }}
              />
              <div className="vt-checkout__classes" data-checkout-classes>
                {classList(tripSnap).map((id) => (
                  <Radio
                    key={id}
                    name="vehicle-class"
                    label={
                      <span className="vt-dir-keep">
                        {CLASS_SLUGS.includes(id as (typeof CLASS_SLUGS)[number])
                          ? t(CLASS_KEYS[id as (typeof CLASS_SLUGS)[number]])
                          : t("vehicleClassFallback")}
                      </span>
                    }
                    checked={vehicle === id}
                    onChange={() => {
                      setVehicle(id);
                      writeDraft({ vehicleClass: id });
                      writeVamosTrip({ vehicle: id });
                    }}
                  />
                ))}
              </div>
            </Card>
          ) : null}

          {step === "details" ? (
            <>
              <Card padding="lg">
                <h2>{t("who-is-travelling")}</h2>
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
                <div className="vt-checkout__radios">
                  <Radio
                    name="acct"
                    label={t("continue-as-guest")}
                    description={t("you-can-claim-the-booking-into-an-account-later")}
                    checked={guest}
                    onChange={() => setGuest(true)}
                  />
                  <Radio
                    name="acct"
                    label={tCommon("create-an-account")}
                    description={t("keeps-your-booking-history-and-addresses")}
                    checked={!guest}
                    onChange={() => setGuest(false)}
                  />
                </div>
                {guest ? (
                  <p>{t("guestNoPassword")}</p>
                ) : (
                  <p>{t("accountAfterPay")}</p>
                )}
              </Card>

              <Card padding="lg">
                <h2>{t("flight-and-pickup-details")}</h2>
                <Input
                  label={tCommon("flight-number")}
                  value={draft.flightNumber}
                  onChange={(e) => writeDraft({ flightNumber: e.target.value })}
                />
                <Input
                  label={t("airline")}
                  value={airline}
                  onChange={(e) => setAirline(e.target.value)}
                />
                <Textarea
                  label={t("notes-for-the-driver")}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  hint={t("meeting-point-gate-code-ski-equipment")}
                />
              </Card>

              <Card padding="lg">
                <h2>{t("extras")}</h2>
                <Checkbox
                  label={t("childSeat")}
                  checked={childSeat}
                  onChange={(e) => setChildSeat(e.target.checked)}
                />
                <Counter
                  label={t("additional-stops")}
                  value={stops}
                  min={0}
                  max={3}
                  onChange={setStops}
                />
              </Card>
            </>
          ) : null}

          {step === "payment" ? (
            <Card padding="lg">
              <h2>{t("payment")}</h2>
              <p>{t("charged-now-secured-by-stripe")}</p>
              <div className="vt-checkout__radios">
                <Radio
                  name="billing"
                  label={t("billingIndividual")}
                  checked={billingKind === "individual"}
                  onChange={() => setBillingKind("individual")}
                />
                <Radio
                  name="billing"
                  label={t("billingCompany")}
                  checked={billingKind === "company"}
                  onChange={() => setBillingKind("company")}
                />
              </div>
              {billingKind === "company" ? (
                <>
                  <Input label={t("companyName")} value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                  <Input
                    label={t("companyAddress")}
                    value={companyAddress}
                    onChange={(e) => setCompanyAddress(e.target.value)}
                  />
                  <Input label={t("companyVat")} value={companyVat} onChange={(e) => setCompanyVat(e.target.value)} />
                </>
              ) : null}
              <Input
                label={t("payerEmail")}
                value={payerEmail || contact.email}
                onChange={(e) => setPayerEmail(e.target.value)}
              />
              {payUrl ? (
                <>
                  <p>{t("payLinkSent")}</p>
                  {reference ? <p>{t("unpaidReference", { reference })}</p> : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(payUrl);
                    }}
                  >
                    {t("copyPayLink")}
                  </Button>
                  <Button variant="ghost" size="sm" href={`https://wa.me/?text=${encodeURIComponent(payUrl)}`}>
                    {t("whatsappPayLink")}
                  </Button>
                </>
              ) : (
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => void sendPayLink()}>
                  {t("sendPayLink")}
                </Button>
              )}
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
                <>
                  <div>
                    <Input
                      label={t("coupon-or-voucher-code")}
                      value={coupon}
                      onChange={(e) => setCoupon(e.target.value)}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCouponApplied(coupon.trim() || null)}
                    >
                      {tCommon("apply")}
                    </Button>
                    {couponApplied ? (
                      <Tag onRemove={() => setCouponApplied(null)}>
                        {t("couponCode", { code: couponApplied })}
                      </Tag>
                    ) : null}
                  </div>
                  <TurnstileWidget
                    siteKey={turnstileSiteKey}
                    action="checkout"
                    onToken={setTurnstile}
                  />
                </>
              )}
            </Card>
          ) : null}
        </div>

        <aside className="vt-checkout__rail" data-checkout-rail>
          <Card padding="lg">
            <Badge tone="accent">{t("charged-now-secured-by-stripe")}</Badge>
            <RouteSummary pickup={railPickup} dropoff={railDrop} />
            <div data-checkout-total>
              <PriceSummary total={null} totalLabel={t("total")} />
            </div>
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
            {refusal ? (
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
              <Button size="lg" block disabled={busy} onClick={() => continueDetails()}>
                {t("continue")}
              </Button>
            ) : null}
            {step === "payment" ? (
              <Button size="lg" block disabled={busy} onClick={() => void onPay()}>
                {t("pay-and-confirm")}
              </Button>
            ) : null}
            <p>
              <Icon name="shield-check" size={16} /> {t("by-continuing-you-accept-the-terms-and-the-cance")}
            </p>
            <Alert tone="info">{t("need-something-unusual-a-bus-a-wedding-an-overni")}</Alert>
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
