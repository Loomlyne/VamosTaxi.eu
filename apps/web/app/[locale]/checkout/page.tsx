import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { asQuote } from "@/lib/db/identity";
import { CheckoutClient } from "./CheckoutClient";
import "./checkout.css";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "checkout" });
  return { title: t("who-is-travelling") };
}

export default async function CheckoutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { env } = getCloudflareContext();

  let freeCancelHours: number | null = null;
  let checkoutWindowMinutes: number | null = null;
  try {
    const rows = await asQuote(env, (sql) =>
      sql<{ free_cancel_hours: number; checkout_window_minutes: number }[]>`
        select free_cancel_hours, checkout_window_minutes
          from public.quote_settings_version()
      `,
    );
    const row = rows[0];
    if (row) {
      freeCancelHours = row.free_cancel_hours;
      checkoutWindowMinutes = row.checkout_window_minutes;
    }
  } catch {
    // TBC pills stay TBC (D-24). Never invent hours.
  }

  const publishableKey =
    env.STRIPE_PUBLISHABLE_KEY && env.STRIPE_PUBLISHABLE_KEY !== "pk_test_placeholder"
      ? env.STRIPE_PUBLISHABLE_KEY
      : "";

  return (
    <CheckoutClient
      locale={locale}
      freeCancelHours={freeCancelHours}
      checkoutWindowMinutes={checkoutWindowMinutes}
      turnstileSiteKey={env.TURNSTILE_SITE_KEY}
      publishableKey={publishableKey}
    />
  );
}
