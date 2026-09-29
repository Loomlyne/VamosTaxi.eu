"use client";

import { useTranslations } from "next-intl";
import { ContactFields, FlightField } from "@/components/booking";
import { DisclosureRow } from "@/components/checkout/DisclosureRow";
import { ExtraRow } from "@/components/checkout/ExtraRow";
import { Input, Textarea } from "@/components/forms";
import { firstPayError } from "@/lib/checkout/pay-validate";
import { useCheckoutFlow } from "../CheckoutPage";
import { useCheckoutForm } from "../CheckoutForm";
import { SectionCard } from "./SectionCard";

/**
 * Section 2, "Who is travelling" (D-12, D-13, D-14, D-15): one contact, the flight for
 * airport pickups, the live book's extras (unticked, named by the owner in the customer's
 * language), and two folded optional blocks. Contact data lives in this component tree
 * only: never in the URL, never in localStorage (T-26.3-19-03).
 */
export function ContactSection() {
  const t = useTranslations("checkout");
  const flow = useCheckoutFlow();
  const f = useCheckoutForm();

  const msg = (key: keyof typeof f.fieldErrors) => {
    const k = f.fieldErrors[key];
    return k ? t(k) : undefined;
  };

  const done =
    firstPayError({
      classChosen: true,
      firstName: f.contact.firstName,
      lastName: f.contact.lastName,
      email: f.contact.email,
      mobile: f.contact.mobile,
      airport: f.airport,
      flight: f.flight,
      companyOpen: false,
      companyName: "",
      companyAddress: "",
      companyVat: "",
    }) === null;

  const aside = f.signedInEmail ? (
    <span className="vt-co__signed" data-co-signed-in>
      {t("signedInAs", { email: f.signedInEmail })}
    </span>
  ) : (
    <a className="vt-co__link" href={f.signInHref} onClick={f.stashForSignIn} data-co-sign-in>
      {t("signInLink")}
    </a>
  );

  const updating = f.price.kind === "updating";

  return (
    <SectionCard n={2} title={t("who-is-travelling")} done={done} headerEnd={aside} id="co-section-contact">
      <fieldset className="vt-co__fieldset" disabled={f.paying}>
        <div data-co-contact className="vt-co__contact">
          <ContactFields
            value={f.contact}
            errors={{
              firstName: msg("firstName"),
              lastName: msg("lastName"),
              email: msg("email"),
              mobile: msg("mobile"),
            }}
            onChange={f.setContact}
            emailHint={t("confirmHint")}
            mobileHint={t("the-driver-calls-this-number-on-arrival")}
            labels={{
              firstName: t("contactFirstName"),
              lastName: t("contactLastName"),
              email: t("contactEmail"),
              mobile: t("contactMobile"),
            }}
          />
        </div>

        {f.airport ? (
          <div className="vt-co__block" data-co-s2-flight>
            <FlightField
              value={f.flight}
              date={flow.trip.when ? flow.trip.when.slice(0, 10) : undefined}
              onChange={f.setFlight}
              onBlur={f.flightBlur}
            />
            {msg("flight") || f.flightError ? (
              <p className="vt-co__field-error" role="alert">
                {msg("flight") ?? f.flightError}
              </p>
            ) : null}
          </div>
        ) : null}

        {f.extras.length > 0 ? (
          <div className="vt-co__block" data-co-extras>
            <h3 className="vt-co__sub">{t("extras")}</h3>
            <p className="vt-co__hint">{t("extrasHint")}</p>
            <div className="vt-co__extras">
              {f.extras.map((item) => (
                <ExtraRow
                  key={item.code}
                  code={item.code}
                  name={f.extraName(item)}
                  amount={flow.money(flow.pricingNotLive ? null : item.amountRappen)}
                  checked={f.ticked.includes(item.code)}
                  updating={updating}
                  onChange={(on) => f.toggleExtra(item.code, on)}
                />
              ))}
            </div>
          </div>
        ) : null}

        <div className="vt-co__disclosures">
          <DisclosureRow
            id="co-company"
            icon="briefcase"
            label={t("discCompany")}
            optionalLabel={t("optional")}
            open={f.companyOpen}
            onToggle={f.setCompanyOpen}
          >
            <div data-co-company-name>
              <Input
                label={t("companyName")}
                size="lg"
                value={f.company.name}
                error={msg("companyName")}
                maxLength={200}
                autoComplete="organization"
                onChange={(e) => f.setCompany({ name: e.target.value })}
              />
            </div>
            <Input
              label={t("companyAddress")}
              size="lg"
              value={f.company.address}
              maxLength={400}
              autoComplete="street-address"
              onChange={(e) => f.setCompany({ address: e.target.value })}
            />
            <Input
              label={t("companyVat")}
              size="lg"
              value={f.company.vat}
              maxLength={40}
              autoComplete="off"
              onChange={(e) => f.setCompany({ vat: e.target.value })}
            />
          </DisclosureRow>
          <DisclosureRow
            id="co-note"
            icon="message-circle"
            label={t("discNote")}
            optionalLabel={t("optional")}
            open={f.noteOpen}
            onToggle={f.setNoteOpen}
          >
            <Textarea
              label={t("notes-for-the-driver")}
              hint={t("noteHint")}
              rows={3}
              maxLength={500}
              value={f.note}
              onChange={(e) => f.setNote(e.target.value)}
            />
          </DisclosureRow>
        </div>
      </fieldset>
    </SectionCard>
  );
}
