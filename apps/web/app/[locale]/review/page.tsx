import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { createNavigation } from "next-intl/navigation";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { routing, type Locale } from "@/i18n/routing";
import { CheckerMark } from "@/components/core";
import { ReviewForm } from "./ReviewForm";
import "@/components/marketing/PageHero.css";
import "./review.css";

const { Link } = createNavigation(routing);

export const dynamic = "force-dynamic";

function turnstileSiteKey(): string | undefined {
  try {
    const { env } = getCloudflareContext();
    return env.TURNSTILE_SITE_KEY ?? process.env.TURNSTILE_SITE_KEY;
  } catch {
    return process.env.TURNSTILE_SITE_KEY;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "reviews" });
  return {
    title: t("submit-review"),
    description: t("review-this-trip"),
    robots: { index: false, follow: false },
  };
}

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string; bookingRef?: string }>;
}) {
  const { locale: localeParam } = await params;
  setRequestLocale(localeParam);
  const locale = localeParam as Locale;
  const query = await searchParams;
  const t = await getTranslations("reviews");
  const tCommon = await getTranslations("common");
  const siteKey = turnstileSiteKey();
  const token = typeof query.token === "string" ? query.token.trim() : "";
  const bookingRef = typeof query.bookingRef === "string" ? query.bookingRef.trim() : "";

  return (
    <main data-page="review">
      <header data-mh-hero="1">
        <div className="vt-mh-hero-inner">
          <div className="vt-mh-checker" aria-hidden="true">
            <CheckerMark size={56} opacity={0.9} />
          </div>
          <nav aria-label={tCommon("breadcrumb")} className="vt-mh-crumb">
            <Link href="/">{tCommon("home")}</Link>
            <span aria-hidden="true">/</span>
            <span>{t("submit-review")}</span>
          </nav>
          <p className="vt-mh-kicker">{t("review-this-trip")}</p>
          <h1>{t("submit-review")}</h1>
        </div>
      </header>

      <div className="vt-review-wrap">
        {token || bookingRef ? (
          <ReviewForm siteKey={siteKey} locale={locale} token={token} bookingRef={bookingRef} />
        ) : (
          <div className="vt-review-card" role="status">
            <p>{t("we-could-not-find-this-booking-check-the")}</p>
          </div>
        )}
      </div>
    </main>
  );
}
