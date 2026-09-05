"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/feedback/Alert";
import { Badge, Button, Card, Icon, Tag } from "@/components/core";
import { Checkbox, Counter, Input, Radio, Textarea } from "@/components/forms";
import { StepIndicator } from "@/components/navigation/StepIndicator";
import { PriceSummary, RouteSummary } from "@/components/transfer";
import { ContactFields, type ContactFieldsErrors, type ContactFieldsValue } from "@/components/booking";
import { TurnstileWidget } from "@/components/forms/TurnstileWidget";
import { useBookingDraft } from "@/lib/booking-draft";
import { PaymentPanel } from "./PaymentPanel";

export type CheckoutClientProps = {
  locale: string;
  freeCancelHours: number | null;
  checkoutWindowMinutes: number | null;
  turnstileSiteKey: string | undefined;
  publishableKey: string;
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

export function CheckoutClient({
  locale,
  freeCancelHours,
  checkoutWindowMinutes,
  turnstileSiteKey,
  publishableKey,
}: CheckoutClientProps) {
  const t = useTranslations("checkout");
  const tCommon = useTranslations("common");
  const [draft, writeDraft] = useBookingDraft();

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

  useEffect(() => {
    if (!draft.quoteId) return;
    if (draft.idempotencyKey) return;
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
        code?: string;
      };
      if (!res.ok) {
        const key = REFUSAL_KEYS[json.code ?? ""] ?? "quoteExpired";
        if (json.code === "coupon_no_longer_valid") setCouponApplied(null);
        setRefusal(key);
        return;
      }
      if (json.publishable_key) setPublishable(json.publishable_key);
      setClientSecret(json.client_secret ?? null);
    } catch {
      setRefusal("quoteExpired");
    } finally {
      setBusy(false);
    }
  }

  const requote = refusal === "quoteExpired" || refusal === "priceChanged" || refusal === "engineChanged" || refusal === "paymentWindowClosed";

  return (
    <div className="vt-checkout">
      <div className="vt-checkout__top">
        <Button variant="ghost" size="sm" icon="chevron-left" href="/">
          {t("change-vehicle")}
        </Button>
        <div className="vt-checkout__steps">
          <StepIndicator
            steps={[t("checkoutStepQuote"), t("checkoutStepVehicle"), t("checkoutStepPay")]}
            current={2}
          />
        </div>
      </div>

      <div className="vt-checkout__grid">
        <div className="vt-checkout__main">
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

          <Card padding="lg">
            {/* D-21: no Card/PayPal/Cash radios. Stripe Element owns methods. */}
            <h2>{t("payment")}</h2>
            <p>{t("charged-now-secured-by-stripe")}</p>
            {clientSecret ? (
              <PaymentPanel publishableKey={publishable} clientSecret={clientSecret} />
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
        </div>

        <aside className="vt-checkout__rail">
          <Card padding="lg">
            <Badge tone="accent">{t("charged-now-secured-by-stripe")}</Badge>
            <RouteSummary pickup={draft.pickup} dropoff={draft.destination} />
            <PriceSummary total={null} totalLabel={t("total")} />
            <p className="vt-checkout__charge">{t("chargeIn", { currency: t("chargeCurrencyName") })}</p>
            {freeCancelHours != null ? (
              <p>{t("freeCancelHours", { hours: freeCancelHours })}</p>
            ) : (
              <p>
                <span data-tok>{t("cancel-free-of-charge-up-to-24-hours-before-pick")}</span>
              </p>
            )}
            {refusal ? (
              <Alert tone={refusal === "pricingNotLive" ? "info" : "danger"}>
                {t(refusal)}
                {requote ? (
                  <Button variant="ghost" size="sm" href="/">
                    {t("requote")}
                  </Button>
                ) : null}
              </Alert>
            ) : null}
            <Button size="lg" block disabled={busy} onClick={() => void startPayment()}>
              {t("pay-and-confirm")}
            </Button>
            <p>
              <Icon name="shield-check" size={16} /> {t("by-continuing-you-accept-the-terms-and-the-cance")}
            </p>
            <Alert tone="info">{t("need-something-unusual-a-bus-a-wedding-an-overni")}</Alert>
            {checkoutWindowMinutes != null ? (
              <p className="vt-checkout__charge">{t("checkoutWindow", { minutes: checkoutWindowMinutes })}</p>
            ) : null}
          </Card>
        </aside>
      </div>
    </div>
  );
}
