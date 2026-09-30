import type { Metadata } from "next";
import type { ReactNode } from "react";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";
import { Card } from "@/components/core";
import { Table, type TableColumn } from "@/components/data";
import { CookieSettingsChangeButton } from "@/components/consent/CookieBanner";
import { LanguageCoverageNotice, LegalPage, PendingSlot, type LegalSection } from "@/components/legal";
import { buildAlternates } from "@/lib/metadata";

const { Link, getPathname } = createNavigation(routing);

const COOKIES_SECTIONS: LegalSection[] = [
  { id: "what", number: "01", titleKey: "legal.what-we-mean-by-cookies" },
  { id: "necessary", number: "02", titleKey: "cookies.cookies-we-set" },
  { id: "analytics", number: "03", titleKey: "cookies.cookieless-analytics" },
  { id: "change", number: "04", titleKey: "legal.changing-your-mind" },
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
  const tCookies = await getTranslations({ locale, namespace: "cookies" });
  return {
    title: tCommon("cookie-policy"),
    description: tCookies("necessary-only-standfirst"),
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
      standfirstKey="cookies.necessary-only-standfirst"
      kickerKey="common.legal"
      effectiveDateLabel="Cookies effective date"
      versionLabel="Cookies version"
      consentDated
    >
      <LanguageCoverageNotice page="cookies" />

      <section id="what">
        <h2>
          <span data-lg-n="1">01</span>
          {t("what-we-mean-by-cookies")}
        </h2>
        <p>{t("small-files-a-site-stores-in-your-browser-plus-t")}</p>
      </section>

      <section id="necessary">
        <h2>
          <span data-lg-n="1">02</span>
          {tCookies("cookies-we-set")}
        </h2>
        <p>{tCookies("necessary-only-standfirst")}</p>
        <h4>{tCookies("strictly-necessary")}</h4>
        <div>
          <Table
            columns={columns}
            rowKey="slug"
            rows={[
              {
                slug: "locale",
                name: <span data-i18n-skip>NEXT_LOCALE</span>,
                purpose: tCookies("language-cookie-purpose"),
                provider: "Vamos Taxi",
                duration: <PendingSlot label="Language cookie duration" />,
              },
              {
                slug: "session",
                name: <span data-i18n-skip>sb-*-auth-token</span>,
                purpose: tCookies("session-cookie-purpose"),
                provider: "Vamos Taxi · Supabase",
                duration: <PendingSlot label="Session duration" />,
              },
              {
                slug: "consent",
                name: <span data-i18n-skip>consent_subject · vamosCookieConsent</span>,
                purpose: tCookies("consent-subject-purpose"),
                provider: "Vamos Taxi",
                duration: <PendingSlot label="Consent duration" />,
              },
            ]}
          />
        </div>
        <div className="vt-legal-blank--row" data-meta-slot="cookies">
          <p>
            {tCookies.rich("meta-row", {
              b: (chunks) => <strong>{chunks}</strong>,
              code: (chunks) => <code className="vt-dir-keep">{chunks}</code>,
            })}
          </p>
        </div>
      </section>

      <section id="analytics">
        <h2>
          <span data-lg-n="1">03</span>
          {tCookies("cookieless-analytics")}
        </h2>
        <p>{tCookies("cookieless-analytics")}</p>
        <p>{tCookies("no-ads")}</p>
      </section>

      <section id="change">
        <h2>
          <span data-lg-n="1">04</span>
          {t("changing-your-mind")}
        </h2>
        <p>{tCookies("withdrawal-new-row")}</p>
        <p>
          <Link href="/privacy#retention">{tCommon("privacy-policy")}</Link>.
        </p>
      </section>

      <Card padding="lg">
        <h3>{t("change-your-mind-any-time")}</h3>
        <p>{tCookies("withdrawal-new-row")}</p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--vt-space-3)",
            marginBlockStart: "var(--vt-space-4)",
            alignItems: "center",
          }}
        >
          <CookieSettingsChangeButton label={tCookies("record-choice-again")} />
          <Link href={privacyHref}>{tCommon("privacy-policy")}</Link>
        </div>
      </Card>
    </LegalPage>
  );
}
