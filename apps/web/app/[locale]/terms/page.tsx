import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";
import { Icon } from "@/components/core";
import { LanguageCoverageNotice, LegalPage, PendingSlot, type LegalSection } from "@/components/legal";
import { buildAlternates } from "@/lib/metadata";

const { Link } = createNavigation(routing);

const TERMS_SECTIONS: LegalSection[] = [
  { id: "parties", number: "01", titleKey: "legal.who-you-contract-with" },
  { id: "scope", number: "02", titleKey: "common.scope" },
  { id: "booking", number: "03", titleKey: "legal.how-a-booking-is-formed" },
  { id: "price", number: "04", titleKey: "common.fixed-price" },
  { id: "carriers", number: "05", titleKey: "legal.partner-carriers" },
  { id: "passenger", number: "06", titleKey: "legal.your-obligations" },
  { id: "luggage", number: "07", titleKey: "common.luggage-child-seats" },
  { id: "waiting", number: "08", titleKey: "ops.waiting-time" },
  { id: "noshow", number: "09", titleKey: "legal.no-show" },
  { id: "changes", number: "10", titleKey: "common.changes-cancellation" },
  { id: "payment", number: "11", titleKey: "common.payment" },
  { id: "complaints", number: "12", titleKey: "legal.complaints" },
  { id: "liability", number: "13", titleKey: "legal.liability" },
  { id: "force", number: "14", titleKey: "legal.force-majeure" },
  { id: "data", number: "15", titleKey: "legal.your-data" },
  { id: "law", number: "16", titleKey: "common.governing-law-venue" },
];

export async function generateMetadata(): Promise<Metadata> {
  const tCommon = await getTranslations("common");
  const tLegal = await getTranslations("legal");
  return {
    title: tCommon("terms-conditions"),
    description: tLegal("the-rules-that-apply-when-you-book-a-transfer-wi"),
    alternates: buildAlternates("/terms"),
  };
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal");
  const tCommon = await getTranslations("common");
  const tOps = await getTranslations("ops");

  return (
    <LegalPage
      page="terms"
      sections={TERMS_SECTIONS}
      titleKey="common.terms-conditions"
      standfirstKey="legal.the-rules-that-apply-when-you-book-a-transfer-wi"
      kickerKey="common.legal"
      effectiveDateLabel="Terms effective date"
      versionLabel="Terms version"
    >
      <LanguageCoverageNotice page="terms" />

      <section id="parties">
        <h2>
          <span data-lg-n="1">01</span>
          {t("who-you-contract-with")}
        </h2>
        <p>{t("vamos-taxi-gmbh-bleicherstrasse-16-8953-dietikon")}</p>
        <div data-slot="1" data-i18n-skip>
          <p data-slot-k="1">Client legal text · contracting party</p>
          <p>
            Must state who the transport contract is with, in one sentence a passenger can
            understand, and must match the About page and the service pages.
          </p>
        </div>
        <p>
          {t("registered-as")} <span data-i18n-skip>Vamos Taxi</span>
          {t("company-number-ch-020-4-077-792-7-at-the-commerc")}{" "}
          <Link href="/imprint">{tCommon("imprint")}</Link>.
        </p>
      </section>

      <section id="scope">
        <h2>
          <span data-lg-n="1">02</span>
          {tCommon("scope")}
        </h2>
        <p>{t("these-terms-cover-pre-booked-private-transfers-a")}</p>
        <p>{t("we-do-not-operate-a-street-hail-or-on-demand-ser")}</p>
        <h4>{t("not-covered-by-this-document")}</h4>
        <ul>
          <li>
            {t("how-we-handle-your-personal-data-see-the")}{" "}
            <Link href="/privacy">{tCommon("privacy-policy")}</Link>.
          </li>
          <li>
            {t("cookies-and-consent-see-the")}{" "}
            <Link href="/cookies">{tCommon("cookie-policy")}</Link>.
          </li>
          <li>
            {t("cancellations-changes-and-refunds-see-the")}{" "}
            <Link href="/cancellation">{tCommon("cancellation-refund-policy")}</Link>.
          </li>
        </ul>
      </section>

      <section id="booking">
        <h2>
          <span data-lg-n="1">03</span>
          {t("how-a-booking-is-formed")}
        </h2>
        <p>{t("you-enter-the-route-the-date-and-the-time-and-th")}</p>
        <p>{t("the-booking-exists-once-that-confirmation-reache")}</p>
        <h3>{t("what-the-confirmation-contains")}</h3>
        <ul>
          <li>{t("booking-reference-pickup-time-and-pickup-address")}</li>
          <li>{t("vehicle-class-passenger-and-luggage-count")}</li>
          <li>{t("the-price-you-paid-in-swiss-francs")}</li>
          <li>{t("how-to-change-or-cancel-the-booking")}</li>
        </ul>
        <p>
          {t("driver-name-vehicle-and-telephone-number-are-sen")}{" "}
          {tCommon("driver-details-lead-time")} {tCommon("before-pickup")}
        </p>
      </section>

      <section id="price">
        <h2>
          <span data-lg-n="1">04</span>
          {tCommon("fixed-price")}
        </h2>
        <p>{t("the-price-shown-at-the-last-step-is-the-price-yo")}</p>
        <h4>{tCommon("included-2")}</h4>
        <ul>
          <li>{t("the-journey-between-the-two-addresses-you-gave-u")}</li>
          <li>
            {t("waiting-time-as-set-out-in-section")} <a href="#waiting">08</a>.
          </li>
          <li>{t("tolls-road-charges-and-airport-access-fees")}</li>
          <li>{t("the-gratuity-tipping-is-not-expected-on-top")}</li>
        </ul>
        <h4>{t("charged-separately-only-if-you-ask-for-it")}</h4>
        <ul>
          <li>
            {t("additional-stops")} <PendingSlot label="Extra stop fee" /> {t("per-stop")}
          </li>
          <li>
            {t("waiting-beyond-the-included-allowance")} <PendingSlot label="Extra waiting rate" />.
          </li>
          <li>
            {t("extended-city-stay-maximum")} <PendingSlot label="City stay minutes" /> {tOps("minutes")}{" "}
            <PendingSlot label="City stay fee" />.
          </li>
          <li>
            {t("oversized-or-unusual-items-declared-at-booking")}{" "}
            <PendingSlot label="Oversize item fee" />.
          </li>
        </ul>
      </section>

      <section id="carriers">
        <h2>
          <span data-lg-n="1">05</span>
          {t("partner-carriers")}
        </h2>
        <p>{t("some-journeys-are-driven-by-a-partner-carrier-wo")}</p>
        <div data-slot="1" data-i18n-skip>
          <p data-slot-k="1">Client legal text · subcontracting</p>
          <p>
            Must state that we may use partner carriers, what standard they are held to, who
            carries the licence and insurance, and who the passenger complains to.
          </p>
        </div>
      </section>

      <section id="passenger">
        <h2>
          <span data-lg-n="1">06</span>
          {t("your-obligations")}
        </h2>
        <ul>
          <li>{t("give-an-address-the-driver-can-reach-and-a-mobil")}</li>
          <li>{t("be-at-the-pickup-point-at-the-agreed-time")}</li>
          <li>{t("tell-us-the-flight-number-for-an-airport-pickup")}</li>
          <li>{t("declare-passengers-and-bags-honestly-a-vehicle-i")}</li>
          <li>{t("wear-a-seatbelt-and-keep-to-swiss-road-law")}</li>
        </ul>
        <p>{t("smoking-is-not-permitted-in-our-vehicles-alcohol")}</p>
        <div data-slot="1" data-i18n-skip>
          <p data-slot-k="1">Client legal text · refusal of carriage & soiling</p>
          <p>
            Must state when a driver may refuse or end a journey, and what a passenger is
            liable for if a vehicle is damaged or soiled.
          </p>
        </div>
      </section>

      <section id="luggage">
        <h2>
          <span data-lg-n="1">07</span>
          {tCommon("luggage-child-seats")}
        </h2>
        <p>
          {t("every-booked-seat-carries-one-medium-case-of")} <PendingSlot label="Case dimensions" />{" "}
          {t("and-one-piece-of-hand-luggage-a-vehicle-is-assig")}
        </p>
        <h3>{t("declare-in-advance")}</h3>
        <p>{t("skis-and-snowboards-folding-bicycles-collapsible")}</p>
        <h3>{t("children")}</h3>
        <p>{t("child-and-booster-seats-are-available-on-request")}</p>
        <div data-slot="1" data-i18n-skip>
          <p data-slot-k="1">Client legal text · refused and unaccompanied items</p>
          <p>Must state what may not be carried, and what happens to luggage left in a vehicle.</p>
        </div>
      </section>

      <section id="waiting">
        <h2>
          <span data-lg-n="1">08</span>
          {tOps("waiting-time")}
        </h2>
        <p>{t("waiting-is-included-measured-from-the-pickup-tim")}</p>
        <ul>
          <li>
            {t("airport-pickups")} <PendingSlot label="Airport waiting" /> {t("counted-from-the-actual-landing-time-we-see-agai")}
          </li>
          <li>
            {t("all-other-pickups")} <PendingSlot label="Standard waiting" /> {t("counted-from-the-booked-time")}
          </li>
        </ul>
        <p>
          {t("beyond-the-allowance-we-charge")} <PendingSlot label="Extra waiting rate" />.{" "}
          {t("if-your-flight-is-delayed-the-allowance-moves-wi")}
        </p>
      </section>

      <section id="noshow">
        <h2>
          <span data-lg-n="1">09</span>
          {t("no-show")}
        </h2>
        <p>
          {t("a-booking-counts-as-a-no-show-when-the-waiting-a")} <a href="#waiting">08</a>{" "}
          {t("has-run-out-and-we-have-called-your-number")}{" "}
          <PendingSlot label="Noshow call attempts" /> {t("times-without-an-answer")}
        </p>
        <p>
          {t("a-no-show-is-not-refunded-what-we-hold-on-record")}{" "}
          <Link href="/privacy">{tCommon("privacy-policy")}</Link>.
        </p>
        <h3>{t("if-the-driver-does-not-arrive")}</h3>
        <p>
          {t("call-us-on-the-number-in-your-confirmation-where")}{" "}
          <Link href="/cancellation">{tCommon("cancellation-refund-policy")}</Link>.
        </p>
      </section>

      <section id="changes">
        <h2>
          <span data-lg-n="1">10</span>
          {tCommon("changes-cancellation")}
        </h2>
        <p>{t("change-or-cancel-from-the-link-in-your-confirmat")}</p>
        <div data-flag="1">
          <p data-flag-k="1">
            <Icon name="info" size={14} color="var(--vt-charcoal-900)" /> {t("one-source-of-truth")}
          </p>
          <p>
            {t("windows-refund-shares-modification-deadlines-and")}{" "}
            <Link href="/cancellation">{tCommon("cancellation-refund-policy")}</Link>.
          </p>
          <p>{t("that-document-governs-this-section-stays-short-o")}</p>
        </div>
      </section>

      <section id="payment">
        <h2>
          <span data-lg-n="1">11</span>
          {tCommon("payment")}
        </h2>
        <p>{t("you-pay-when-you-book-card-payments-are-processe")}</p>
        <p>
          {t("accepted-methods")} <PendingSlot label="Payment methods" />.
        </p>
        <p>
          {t("invoices-and-corporate-accounts")} <Link href="/contact">{t("talk-to-us")}</Link>{" "}
          {t("before-you-book")}
        </p>
      </section>

      <section id="complaints">
        <h2>
          <span data-lg-n="1">12</span>
          {t("complaints")}
        </h2>
        <p>
          {t("tell-us-within")} <PendingSlot label="Complaint window days" /> {t("days-of-the-journey-by-email-or-telephone-quotin")}
        </p>
        <ul>
          <li>
            {t("and-we-answer-within")} <PendingSlot label="Complaint resolution days" /> {tCommon("days")}
          </li>
          <li>
            {t("any-refund-we-agree-is-paid-within")} <PendingSlot label="Refund payout days" /> {tCommon("days")}
          </li>
        </ul>
        <div data-slot="1" data-i18n-skip>
          <p data-slot-k="1">Client legal text · escalation & dispute resolution</p>
          <p>
            Must name the body a customer can go to if we cannot agree. Same slot as on the
            imprint; fill both from one answer.
          </p>
        </div>
      </section>

      <section id="liability">
        <h2>
          <span data-lg-n="1">13</span>
          {t("liability")}
        </h2>
        <div data-slot="1" data-i18n-skip>
          <p data-slot-k="1">Client legal text · liability</p>
          <p>
            The one section that must be drafted, not adapted. Consequential loss needs to be
            addressed explicitly.
          </p>
        </div>
        <p>{t("what-we-do-say-plainly-whatever-the-drafting-we")}</p>
      </section>

      <section id="force">
        <h2>
          <span data-lg-n="1">14</span>
          {t("force-majeure")}
        </h2>
        <p>
          {t("snow-closed-roads-strikes-an-airport-shutdown-ev")}{" "}
          <Link href="/cancellation">{tCommon("cancellation-refund-policy")}</Link>.
        </p>
        <div data-slot="1" data-i18n-skip>
          <p data-slot-k="1">Client legal text · definition and consequences</p>
          <p>Must define the events and state the consequence.</p>
        </div>
      </section>

      <section id="data">
        <h2>
          <span data-lg-n="1">15</span>
          {t("your-data")}
        </h2>
        <p>
          {t("what-we-collect-why-who-processes-it-and-how-lon")}{" "}
          <Link href="/privacy">{tCommon("privacy-policy")}</Link>. {t("cookies-and-consent-are-in-the")}{" "}
          <Link href="/cookies">{tCommon("cookie-policy")}</Link>.
        </p>
      </section>

      <section id="law">
        <h2>
          <span data-lg-n="1">16</span>
          {tCommon("governing-law-venue")}
        </h2>
        <p>{t("swiss-law-applies")}</p>
        <div data-slot="1" data-i18n-skip>
          <p data-slot-k="1">Client legal text · venue</p>
          <p>Must name the court. The obvious answer is the seat of the company in Dietikon ZH.</p>
        </div>
        <p>{t("should-any-part-of-these-terms-be-unenforceable")}</p>
      </section>
    </LegalPage>
  );
}
