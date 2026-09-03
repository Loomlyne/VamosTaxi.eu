import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";
import { Button, Card } from "@/components/core";
import { List, ListRow } from "@/components/data";
import { LanguageCoverageNotice, LegalPage, PendingSlot, type LegalSection } from "@/components/legal";
import { buildAlternates } from "@/lib/metadata";
import { SUPPORT_EMAIL, SUPPORT_EMAIL_HREF } from "@/lib/contact-channels";

const { Link, getPathname } = createNavigation(routing);

const PRIVACY_SECTIONS: LegalSection[] = [
  { id: "controller", number: "01", titleKey: "legal.who-is-responsible" },
  { id: "collect", number: "02", titleKey: "legal.what-we-collect" },
  { id: "basis", number: "03", titleKey: "legal.why-we-may-use-it" },
  { id: "processors", number: "04", titleKey: "legal.who-processes-it" },
  { id: "transfers", number: "05", titleKey: "legal.transfers-abroad" },
  { id: "retention", number: "06", titleKey: "legal.how-long-we-keep-it" },
  { id: "rights", number: "07", titleKey: "legal.your-rights" },
  { id: "cookies", number: "08", titleKey: "common.cookies-consent" },
  { id: "requests", number: "09", titleKey: "legal.making-a-request" },
  { id: "changes", number: "10", titleKey: "legal.changes-to-this-policy" },
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const tCommon = await getTranslations({ locale, namespace: "common" });
  const tLegal = await getTranslations({ locale, namespace: "legal" });
  return {
    title: tCommon("privacy-policy"),
    description: tLegal("a-transfer-needs-your-name-two-addresses-a-time"),
    alternates: buildAlternates("/privacy"),
  };
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal");
  const tCommon = await getTranslations("common");
  const tHome = await getTranslations("home");
  const tAccount = await getTranslations("account");
  const contactHref = getPathname({ href: "/contact", locale });
  const cookiesHref = getPathname({ href: "/cookies", locale });

  return (
    <LegalPage
      page="privacy"
      sections={PRIVACY_SECTIONS}
      titleKey="common.privacy-policy"
      standfirstKey="legal.a-transfer-needs-your-name-two-addresses-a-time"
      kickerKey="common.legal"
      effectiveDateLabel="Privacy effective date"
      versionLabel="Privacy version"
    >
      {/* LegalPage PendingSlot: Privacy effective date */}
      {/* LegalPage PendingSlot: Privacy version */}
      <LanguageCoverageNotice page="privacy" />

      <section id="controller">
        <h2>
          <span data-lg-n="1">01</span>
          {t("who-is-responsible")}
        </h2>
        <p>{t("vamos-taxi-gmbh-is-the-controller-of-your-person")}</p>
        {/* ListRow icon= unused — lead tile is tinted yellow (Law 02). Body PendingSlot count below plus those two. */}
        <List>
          <ListRow title={tHome("controller")} subtitle={t("vamos-taxi-gmbh-bleicherstrasse-16-8953-dietikon-2")} />
          <ListRow
            title={t("contact-for-data")}
            subtitle={
              <>
                <a href={SUPPORT_EMAIL_HREF}>{SUPPORT_EMAIL}</a>
                {" · "}
                <a href="tel:+41796267082">+41 79 626 70 82</a>
              </>
            }
          />
          <ListRow title={t("data-protection-officer")} subtitle={<PendingSlot label="Dpo or not required" />} />
          <ListRow
            title={t("representative-in-the-eu")}
            subtitle={<PendingSlot label="Eu representative" />}
            last
          />
        </List>
      </section>

      <section id="collect">
        <h2>
          <span data-lg-n="1">02</span>
          {t("what-we-collect")}
        </h2>
        <p>{t("only-what-a-transfer-needs-plus-what-the-law-mak")}</p>
        <h3>{t("when-you-get-a-price")}</h3>
        <p>{t("pickup-and-drop-off-address-date-and-time-passen")}</p>
        <h3>{t("when-you-book")}</h3>
        <ul>
          <li>{t("lead-passenger-name-email-address-and-mobile-num")}</li>
          <li>{t("pickup-and-drop-off-address-and-any-additional-s")}</li>
          <li>{t("flight-number-where-you-gave-one-and-the-arrival")}</li>
          <li>{t("passenger-and-luggage-count-child-seat-requests")}</li>
          <li>{t("anything-you-type-into-the-notes-field-for-the-d")}</li>
        </ul>
        <h3>{t("when-you-pay")}</h3>
        <p>{t("payment-metadata-only-the-amount-the-currency-th")}</p>
        <h3>{t("while-you-use-the-site")}</h3>
        <p>
          {t("server-logs-page-timestamp-referrer-browser-oper")}{" "}
          <Link href="/cookies">{tCommon("cookie-policy")}</Link>.
        </p>
        <h3>{t("when-you-contact-us")}</h3>
        <p>{t("your-message-and-the-channel-it-came-in-on-kept")}</p>
      </section>

      <section id="basis">
        <h2>
          <span data-lg-n="1">03</span>
          {t("why-we-may-use-it")}
        </h2>
        <List>
          <ListRow
            title={t("to-perform-the-contract")}
            subtitle={t("taking-a-booking-assigning-a-driver-collecting-p")}
          />
          <ListRow
            title={t("legal-obligation")}
            subtitle={
              <>
                {t("accounting-tax-and-the-trip-records-swiss-archiv")}{" "}
                <a href="#retention">06</a>.
              </>
            }
          />
          <ListRow
            title={t("legitimate-interest")}
            subtitle={t("fraud-prevention-service-quality-evidence-of-a-n")}
          />
          <ListRow
            title={tCommon("consent")}
            subtitle={t("analytics-and-marketing-cookies-and-any-newslett")}
            last
          />
        </List>
        <div data-slot="1" data-i18n-skip>
          <p data-slot-k="1">Client legal text · statutory references</p>
          <p>
            Your adviser adds the article references for each basis under revFADP and, where a
            customer is in the EU, the GDPR. The layout holds one reference line per row without
            changing.
          </p>
        </div>
      </section>

      <section id="processors">
        <h2>
          <span data-lg-n="1">04</span>
          {t("who-processes-it")}
        </h2>
        <p>{t("suppliers-who-handle-data-on-our-instructions-un")}</p>
        <h3>{t("the-platform-we-are-building")}</h3>
        <List>
          <ListRow title="Stripe Payments Europe Ltd" subtitle={t("card-payments-dublin-ireland")} />
          <ListRow
            title="Supabase"
            subtitle={
              <>
                {t("booking-database-and-sign-in")} <PendingSlot label="Supabase region" />
              </>
            }
          />
          <ListRow
            title="Cloudflare"
            subtitle={
              <>
                {t("website-hosting-and-delivery")} <PendingSlot label="Cloudflare region" />
              </>
            }
          />
          <ListRow title="Mapbox" subtitle={t("address-lookup-and-route-distance-united-states")} />
          <ListRow
            title="AeroDataBox"
            subtitle={
              <>
                {t("flight-number-and-arrival-time")} <PendingSlot label="AeroDataBox region" />
              </>
            }
          />
          <ListRow
            title={tCommon("resend")}
            subtitle={
              <>
                {t("confirmation-and-driver-detail-emails")} <PendingSlot label="Resend region" />
              </>
            }
          />
          <ListRow
            title="Sentry"
            subtitle={
              <>
                {t("error-diagnostics")} <PendingSlot label="Sentry region" />
              </>
            }
          />
          <ListRow
            title={<PendingSlot label="Analytics provider" />}
            subtitle={
              <>
                {t("site-analytics-only-with-your-consent")} <PendingSlot label="Analytics region" />
              </>
            }
          />
          <ListRow
            title={t("partner-carriers")}
            subtitle={t("the-driver-assigned-to-your-journey-receives-you")}
            last
          />
        </List>
      </section>

      <section id="transfers">
        <h2>
          <span data-lg-n="1">05</span>
          {t("transfers-abroad")}
        </h2>
        <p>{t("some-of-these-suppliers-process-data-outside-swi")}</p>
        <div data-slot="1" data-i18n-skip>
          <p data-slot-k="1">Client legal text · transfer mechanism</p>
          <p>
            One current mechanism per destination — an adequacy decision, or standard contractual
            clauses with the Swiss addendum. The archived policy relies on the EU–US Privacy Shield,
            which stopped being a valid basis in 2020; it cannot be carried over.
          </p>
        </div>
      </section>

      <section id="retention">
        <h2>
          <span data-lg-n="1">06</span>
          {t("how-long-we-keep-it")}
        </h2>
        <List>
          <ListRow
            title={t("trip-records")}
            subtitle={
              <>
                {t("lead-passenger-name-passenger-count-email-start")}{" "}
                <PendingSlot label="Archiving years" /> {t("years-because-swiss-archiving-law-requires-it")}
              </>
            }
          />
          <ListRow
            title={t("payment-records")}
            subtitle={
              <>
                <PendingSlot label="Finance retention" /> {t("for-accounting-and-tax")}
              </>
            }
          />
          <ListRow
            title={t("account-and-marketing-preferences")}
            subtitle={t("until-you-close-the-account-or-withdraw-consent")}
          />
          <ListRow title={t("server-logs")} subtitle={<PendingSlot label="Log retention" />} />
          <ListRow
            title={t("consent-record")}
            subtitle={
              <>
                <PendingSlot label="Consent log retention" /> {t("proof-of-what-you-chose-and-when")}
              </>
            }
            last
          />
        </List>
      </section>

      <section id="rights">
        <h2>
          <span data-lg-n="1">07</span>
          {t("your-rights")}
        </h2>
        <p>{t("two-things-are-true-at-once-and-this-page-shows")}</p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 16rem), 1fr))",
            gap: "var(--vt-space-4)",
            marginBlock: "4px 18px",
          }}
        >
          <Card padding="lg">
            <div
              style={{
                marginBlockEnd: 14,
                fontSize: "var(--vt-label-sm)",
                letterSpacing: "var(--vt-label-tracking)",
                textTransform: "uppercase",
                fontWeight: "var(--vt-label-weight)",
                color: "var(--vt-text-muted)",
              }}
            >
              {t("you-can-ask-us-to")}
            </div>
            <List inset={false}>
              <ListRow title={t("give-you-a-copy-of-what-we-hold")} />
              <ListRow title={t("correct-anything-that-is-wrong")} />
              <ListRow title={t("delete-what-we-are-not-required-to-keep")} />
              <ListRow title={t("restrict-or-object-to-a-particular-use")} />
              <ListRow title={t("send-your-data-to-another-provider")} />
              <ListRow title={t("withdraw-a-consent-you-gave")} last />
            </List>
          </Card>
          <Card tone="inverse" padding="lg">
            <div
              style={{
                marginBlockEnd: 14,
                fontSize: "var(--vt-label-sm)",
                letterSpacing: "var(--vt-label-tracking)",
                textTransform: "uppercase",
                fontWeight: "var(--vt-label-weight)",
                color: "var(--vt-accent)",
              }}
            >
              {t("we-have-to-keep")}
            </div>
            <List inset={false}>
              <ListRow
                inverse
                title={
                  <>
                    {t("trip-records-for")} <PendingSlot label="Archiving years" /> {tAccount("years")}
                  </>
                }
              />
              <ListRow inverse title={t("payment-and-tax-records")} />
              <ListRow inverse title={t("the-record-of-your-cookie-choice")} />
              <ListRow inverse title={t("evidence-relating-to-an-open-claim")} last />
            </List>
          </Card>
        </div>
        <p>{t("so-a-deletion-request-does-not-erase-a-journey-w")}</p>
        <p>{t("you-can-also-complain-to-the-federal-data-protec")}</p>
      </section>

      <section id="cookies">
        <h2>
          <span data-lg-n="1">08</span>
          {tCommon("cookies-consent")}
        </h2>
        <p>{t("strictly-necessary-cookies-keep-a-booking-workin")}</p>
        <p>
          <Link href="/cookies">{t("read-the-cookie-policy")}</Link>
          {tCommon("or")}{" "}
          <Link href="/cookies">{t("open-your-cookie-preferences")}</Link>.
        </p>
      </section>

      <section id="requests">
        <h2>
          <span data-lg-n="1">09</span>
          {t("making-a-request")}
        </h2>
        <p>
          {tCommon("email")} <a href={SUPPORT_EMAIL_HREF}>{SUPPORT_EMAIL}</a>{" "}
          {t("with-the-booking-reference-if-there-is-one-we-an")}{" "}
          <PendingSlot label="Dsr response days" /> {tCommon("days")}
        </p>
        <p>{t("we-may-ask-you-to-confirm-who-you-are-before-we")}</p>
      </section>

      <section id="changes">
        <h2>
          <span data-lg-n="1">10</span>
          {t("changes-to-this-policy")}
        </h2>
        <p>{t("when-this-policy-changes-we-update-the-date-and")}</p>
      </section>

      <Card padding="lg">
        <h3>{t("want-a-copy-of-your-data")}</h3>
        <p>{t("ask-and-we-will-send-what-we-hold-one-person-han")}</p>
        <p
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--vt-space-3)",
            marginBlockStart: "var(--vt-space-4)",
          }}
        >
          <Button variant="secondary" size="md" iconEnd="arrow-right" href={contactHref}>
            {tCommon("contact-us")}
          </Button>
          <Button variant="ghost" size="md" href={cookiesHref}>
            {tCommon("cookie-preferences")}
          </Button>
        </p>
      </Card>
    </LegalPage>
  );
}
