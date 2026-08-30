import type { Metadata } from "next";
import type { ReactNode } from "react";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";
import { Badge, Button, Card } from "@/components/core";
import { Table, type TableColumn } from "@/components/data";
import { LanguageCoverageNotice, LegalPage, PendingSlot, type LegalSection } from "@/components/legal";
import { buildAlternates } from "@/lib/metadata";

const { Link, getPathname } = createNavigation(routing);

const COOKIES_SECTIONS: LegalSection[] = [
  { id: "what", number: "01", titleKey: "legal.what-we-mean-by-cookies" },
  { id: "choice", number: "02", titleKey: "legal.your-current-choice" },
  { id: "necessary", number: "03", titleKey: "cookies.strictly-necessary" },
  { id: "functional", number: "04", titleKey: "cookies.functional" },
  { id: "analytics", number: "05", titleKey: "cookies.analytics" },
  { id: "marketing", number: "06", titleKey: "common.marketing" },
  { id: "change", number: "07", titleKey: "legal.changing-your-mind" },
];

type CookieRow = {
  slug: string;
  name: ReactNode;
  purpose: ReactNode;
  provider: ReactNode;
  duration: ReactNode;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const tCommon = await getTranslations({ locale, namespace: "common" });
  const tLegal = await getTranslations({ locale, namespace: "legal" });
  return {
    title: tCommon("cookie-policy"),
    description: tLegal("four-categories-one-of-which-you-cannot-switch-o"),
    alternates: buildAlternates("/cookies"),
  };
}

export default async function CookiesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal");
  const tCommon = await getTranslations("common");
  const tCookies = await getTranslations("cookies");
  const tHome = await getTranslations("home");
  const privacyHref = getPathname({ href: "/privacy", locale });

  const columns: TableColumn<CookieRow>[] = [
    { key: "name", header: tCommon("name"), render: (r) => r.name },
    { key: "purpose", header: t("purpose"), render: (r) => r.purpose },
    { key: "provider", header: t("provider"), render: (r) => r.provider },
    { key: "duration", header: tHome("duration"), render: (r) => r.duration },
  ];

  return (
    <LegalPage
      page="cookies"
      sections={COOKIES_SECTIONS}
      titleKey="common.cookie-policy"
      standfirstKey="legal.four-categories-one-of-which-you-cannot-switch-o"
      kickerKey="common.legal"
      effectiveDateLabel="Cookies effective date"
      versionLabel="Cookies version"
    >
      <LanguageCoverageNotice page="cookies" />

      <section id="what">
        <h2>
          <span data-lg-n="1">01</span>
          {t("what-we-mean-by-cookies")}
        </h2>
        <p>{t("small-files-a-site-stores-in-your-browser-plus-t")}</p>
        <p>{t("nothing-except-the-strictly-necessary-category-i")}</p>
      </section>

      <section id="choice">
        <h2>
          <span data-lg-n="1">02</span>
          {t("your-current-choice")}
        </h2>
        <p>{t("read-from-this-browser-so-it-is-the-real-state-n")}</p>
        <Card padding="lg">
          <div
            style={{
              marginBlockEnd: 16,
              fontSize: "var(--vt-label-sm)",
              letterSpacing: "var(--vt-label-tracking)",
              textTransform: "uppercase",
              fontWeight: "var(--vt-label-weight)",
              color: "var(--vt-text-muted)",
            }}
          >
            {t("nothing-chosen-yet-only-strictly-necessary-cooki")}
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "10px 12px",
              marginBlockEnd: 18,
            }}
          >
            <Badge tone="inverse" icon="shield-check">
              {t("necessary-on")}
            </Badge>
            <Badge tone="neutral">{tCommon("functional-off")}</Badge>
            <Badge tone="neutral">{tCommon("analytics-off")}</Badge>
            <Badge tone="neutral">{tCommon("marketing-off")}</Badge>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--vt-space-3)" }}>
            <Button variant="secondary" size="md" href="#change">
              {t("change-preferences")}
            </Button>
            <Button variant="ghost" size="md" href="#change">
              {t("reset-my-choice")}
            </Button>
          </div>
        </Card>
        <p>{t("resetting-clears-the-record-and-brings-the-banne")}</p>
      </section>

      <section id="necessary">
        <h2>
          <span data-lg-n="1">03</span>
          {tCookies("strictly-necessary")}
        </h2>
        <p>{t("set-for-everyone-no-consent-needed-because-witho")}</p>
        <h4>{t("strictly-necessary-cannot-be-switched-off")}</h4>
        <div data-lenis-prevent>
          <Table
            columns={columns}
            rowKey="slug"
            rows={[
              {
                slug: "session",
                name: <PendingSlot label="Session cookie" />,
                purpose: t("keeps-you-signed-in-and-holds-the-booking-while"),
                provider: "Vamos Taxi · Supabase",
                duration: <PendingSlot label="Session duration" />,
              },
              {
                slug: "consent",
                name: <PendingSlot label="Consent cookie" />,
                purpose: t("records-which-categories-you-allowed-so-we-can-p"),
                provider: "Vamos Taxi",
                duration: <PendingSlot label="Consent duration" />,
              },
              {
                slug: "stripe",
                name: "__stripe_mid · __stripe_sid",
                purpose: t("fraud-checks-on-the-payment-step"),
                provider: "Stripe",
                duration: <PendingSlot label="Stripe cookie duration" />,
              },
              {
                slug: "hosting",
                name: <PendingSlot label="Hosting cookie" />,
                purpose: t("routes-your-request-and-keeps-the-site-available"),
                provider: "Cloudflare",
                duration: <PendingSlot label="Hosting cookie duration" />,
              },
            ]}
          />
        </div>
      </section>

      <section id="functional">
        <h2>
          <span data-lg-n="1">04</span>
          {tCookies("functional")}
        </h2>
        <p>{t("convenience-only-decline-them-and-everything-sti")}</p>
        <h4>{t("functional-off-until-you-allow-them")}</h4>
        <div data-lenis-prevent>
          <Table
            columns={columns}
            rowKey="slug"
            rows={[
              {
                slug: "lang",
                name: <PendingSlot label="Lang cookie" />,
                purpose: t("remembers-whether-you-read-the-site-in-english-o"),
                provider: "Vamos Taxi",
                duration: <PendingSlot label="Lang cookie duration" />,
              },
              {
                slug: "recent",
                name: <PendingSlot label="Recent address cookie" />,
                purpose: t("offers-your-last-pickup-address-the-next-time-yo"),
                provider: "Vamos Taxi",
                duration: <PendingSlot label="Recent address duration" />,
              },
            ]}
          />
        </div>
      </section>

      <section id="analytics">
        <h2>
          <span data-lg-n="1">05</span>
          {tCookies("analytics")}
        </h2>
        <p>{t("which-step-of-a-booking-people-give-up-on-and-wh")}</p>
        <h4>{t("analytics-off-until-you-allow-them")}</h4>
        <div data-lenis-prevent>
          <Table
            columns={columns}
            rowKey="slug"
            rows={[
              {
                slug: "analytics",
                name: <PendingSlot label="Analytics cookie" />,
                purpose: t("counts-visits-and-measures-where-a-booking-is-ab"),
                provider: <PendingSlot label="Analytics provider" />,
                duration: <PendingSlot label="Analytics duration" />,
              },
              {
                slug: "error",
                name: <PendingSlot label="Error cookie" />,
                purpose: t("links-an-error-report-to-the-session-that-produc"),
                provider: "Sentry",
                duration: <PendingSlot label="Error cookie duration" />,
              },
            ]}
          />
        </div>
      </section>

      <section id="marketing">
        <h2>
          <span data-lg-n="1">06</span>
          {tCommon("marketing")}
        </h2>
        <p>{t("nothing-in-this-category-is-running-today-it-is")}</p>
        <h4>{t("marketing-off-and-currently-unused")}</h4>
        <div data-lenis-prevent>
          <Table
            columns={columns}
            rowKey="slug"
            rows={[
              {
                slug: "marketing",
                name: <PendingSlot label="Marketing cookie" />,
                purpose: t("measures-which-advert-or-campaign-led-to-a-booki"),
                provider: <PendingSlot label="Marketing providers" />,
                duration: <PendingSlot label="Marketing duration" />,
              },
            ]}
          />
        </div>
      </section>

      <section id="change">
        <h2>
          <span data-lg-n="1">07</span>
          {t("changing-your-mind")}
        </h2>
        <p>
          {t("open-your-preferences-from-the-link-in-the-foote")}{" "}
          <a href="#choice">02</a> {t("above-turning-a-category-off-stops-it-immediatel")}{" "}
          <Link href="/privacy#retention">{tCommon("privacy-policy")}</Link>.
        </p>
        <p>{t("your-browser-settings-also-work-and-they-overrid")}</p>
      </section>

      <Card padding="lg">
        <h3>{t("change-your-mind-any-time")}</h3>
        <p>{t("your-choice-is-a-preference-not-a-contract-reope")}</p>
        <p
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--vt-space-3)",
            marginBlockStart: "var(--vt-space-4)",
          }}
        >
          <Button variant="secondary" size="md" href="#change">
            {tCommon("cookie-preferences")}
          </Button>
          <Button variant="ghost" size="md" iconEnd="arrow-right" href={privacyHref}>
            {tCommon("privacy-policy")}
          </Button>
        </p>
      </Card>
    </LegalPage>
  );
}
