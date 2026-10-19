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
  { id: "analytics", number: "03", titleKey: "cookies.analytics" },
  { id: "marketing", number: "04", titleKey: "common.marketing" },
  { id: "change", number: "05", titleKey: "legal.changing-your-mind" },
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
      dated
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
                name: <CookieName plain={tCookies("name-language")} tech="NEXT_LOCALE" />,
                purpose: tCookies("language-cookie-purpose"),
                provider: "Vamos Taxi",
                duration: tCookies("locale-cookie-duration"),
              },
              {
                slug: "session",
                name: <CookieName plain={tCookies("name-sign-in")} tech="vt-auth" />,
                purpose: tCookies("session-cookie-purpose"),
                provider: "Vamos Taxi · Supabase",
                duration: <PendingSlot label="Session duration" />,
              },
              {
                slug: "consent",
                name: <CookieName plain={tCookies("name-cookie-choice")} tech="consent_subject · vamosCookieConsent" />,
                purpose: tCookies("consent-subject-purpose"),
                provider: "Vamos Taxi",
                duration: <PendingSlot label="Consent duration" />,
              },
              {
                // Owner-approved row, .planning/decisions/2026-10-03-vamos-qs-cookie-row.md
                slug: "visitor",
                name: <CookieName plain={tCookies("name-fair-pricing")} tech="vamos_qs" />,
                purpose: tCookies("qs-cookie-purpose"),
                provider: "Vamos Taxi",
                duration: tCookies("qs-cookie-duration"),
              },
              {
                // Owner-approved row, .planning/decisions/2026-10-03-cookies-manage-locale-rows.md
                slug: "manage",
                name: <CookieName plain={tCookies("name-booking-access")} tech="vt_manage" />,
                purpose: tCookies("manage-cookie-purpose"),
                provider: "Vamos Taxi",
                duration: tCookies("manage-cookie-duration"),
              },
              {
                // Owner-approved row, .planning/decisions/2026-10-04-vt-review-cookie-row.md
                slug: "review",
                name: <CookieName plain={tCookies("name-review-access")} tech="vt_review" />,
                purpose: tCookies("review-cookie-purpose"),
                provider: "Vamos Taxi",
                duration: tCookies("review-cookie-duration"),
              },
            ]}
          />
        </div>
      </section>

      <section id="analytics">
        <h2>
          <span data-lg-n="1">03</span>
          {tCookies("analytics")}
        </h2>
        <p>{tCookies("analytics-intro")}</p>
        <div>
          <Table
            columns={columns}
            rowKey="slug"
            rows={[
              {
                slug: "cloudflare",
                name: tCookies("sheet-not-used"),
                purpose: t("counts-visits-and-measures-where-a-booking-is-ab"),
                provider: tCookies("sheet-analytics-providers"),
                duration: tCookies("analytics-cloudflare-duration"),
              },
              {
                slug: "ga",
                name: <CookieTech tech="_ga · _ga_K5MZME44P6" />,
                purpose: tCookies("ga-cookie-purpose"),
                provider: "Google Analytics · Google Ireland Ltd",
                duration: tCookies("ga-cookie-duration"),
              },
            ]}
          />
        </div>
        <p>{tCookies("analytics-consent-mode-note")}</p>
      </section>

      <section id="marketing">
        <h2>
          <span data-lg-n="1">04</span>
          {tCommon("marketing")}
        </h2>
        <p>{tCookies("marketing-intro")}</p>
        <div>
          <Table
            columns={columns}
            rowKey="slug"
            rows={[
              {
                slug: "fbp",
                name: <CookieTech tech="_fbp" />,
                purpose: tCookies("fbp-cookie-purpose"),
                provider: "Meta Pixel · Meta Platforms Ireland Ltd",
                duration: tCookies("fbp-cookie-duration"),
              },
              {
                slug: "google-ads",
                name: tCookies("google-ads-name"),
                purpose: tCookies("google-ads-purpose"),
                provider: "Google Tag Manager · Google Ireland Ltd",
                duration: tCookies("google-ads-duration"),
              },
            ]}
          />
        </div>
      </section>

      <section id="change">
        <h2>
          <span data-lg-n="1">05</span>
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

/** A cookie row's name: the plain name first, the technical name small underneath (owner, 2026-10-04). */
function CookieName({ plain, tech }: { plain: string; tech: string }) {
  return (
    <span style={{ display: "block", minWidth: 0 }}>
      <span style={{ display: "block", fontWeight: "var(--vt-weight-semibold)" }}>{plain}</span>
      <span
        data-vt-no-i18n
        className="vt-dir-keep"
        style={{
          display: "block",
          marginBlockStart: "2px",
          fontFamily: "var(--vt-font-mono)",
          fontSize: "var(--vt-body-xs)",
          color: "var(--vt-text-muted)",
          overflowWrap: "anywhere",
        }}
      >
        {tech}
      </span>
    </span>
  );
}

/** A cookie name with no plain-language label: the technical name only, kept LTR and untranslated. */
function CookieTech({ tech }: { tech: string }) {
  return (
    <span
      data-vt-no-i18n
      className="vt-dir-keep"
      style={{ fontFamily: "var(--vt-font-mono)", fontSize: "var(--vt-body-xs)", overflowWrap: "anywhere" }}
    >
      {tech}
    </span>
  );
}
