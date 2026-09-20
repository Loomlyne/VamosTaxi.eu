import type { ReactNode } from "react";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { routing } from "@/i18n/routing";
import { CookieBanner } from "@/components/consent/CookieBanner";
import { SiteFooter, SiteHeader, SiteShell } from "@/components/shell";
import { CONSENT_COOKIE, readConsentSubject } from "@/lib/consent/cookie";
import { Providers } from "./providers";
import "../globals.css";

function turnstileSiteKey(): string | undefined {
  try {
    const { env } = getCloudflareContext();
    return env.TURNSTILE_SITE_KEY ?? process.env.TURNSTILE_SITE_KEY;
  } catch {
    return process.env.TURNSTILE_SITE_KEY;
  }
}

function isDashboardHost(hostHeader: string | null): boolean {
  const host = (hostHeader ?? "").split(":")[0]?.toLowerCase() ?? "";
  return host === "dashboard.vamostaxi.site" || host === "dashboard.localhost";
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: "Vamos Taxi",
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Pitfall 2 (01-RESEARCH.md): setRequestLocale must be the first
  // statement in this layout — calling it after an early return, or not at
  // all, silently forces the whole route to dynamic rendering and defeats
  // generateStaticParams/edge caching (the Phase 10 10k-visitor target
  // depends on public pages being static/ISR).
  setRequestLocale(locale);

  // T-01-02 (Tampering): reject any segment outside the fixed four-locale
  // list before it reaches a page. The `[locale]` dynamic segment matches
  // any string, so this is the boundary that turns an arbitrary URL
  // segment into a 404 rather than an attempt to render with it.
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const messages = await getMessages();
  const dir = locale === "ar" ? "rtl" : "ltr";
  const jar = await cookies();
  const consentValue = jar.get(CONSENT_COOKIE)?.value;
  const hasConsent = Boolean(
    readConsentSubject(consentValue ? `${CONSENT_COOKIE}=${consentValue}` : null),
  );
  const headerList = await headers();
  const onDashboard = isDashboardHost(
    headerList.get("x-vamos-request-host") ?? headerList.get("host"),
  );
  const siteKey = turnstileSiteKey();
  const showBanner = !hasConsent && !onDashboard;

  return (
    <html lang={locale} dir={dir}>
      <body>
        <Providers locale={locale} messages={messages}>
          {/* CLAUDE.md: "`SiteHeader` and `SiteFooter` are mandatory on every public
              page — old ones and any new one. Never hand-roll a header or footer."
              Composing them here, once, is what makes that rule structural rather than
              remembered: Phase 5's eighteen public routes and the 404/error pages
              (D-20) inherit the shell by construction and cannot forget it.
              `variant="inverse"` — the charcoal sticky bar — is the default everywhere;
              a page whose hero already carries a photograph (home, Phase 5) is the only
              case for `variant="overlay"`, and it will pass that itself once that hero
              exists. `SiteShell` keeps the dev-only gallery outside the composition —
              see its own file for why. HttpOnly consent_subject is read here so the
              banner is omitted on SSR; JS cannot hide it. SiteShell still skips the
              banner on ops/dashboard/dev. */}
          <SiteShell
            header={<SiteHeader />}
            footer={<SiteFooter />}
            banner={showBanner ? <CookieBanner siteKey={siteKey} /> : null}
          >
            {children}
          </SiteShell>
        </Providers>
      </body>
    </html>
  );
}
