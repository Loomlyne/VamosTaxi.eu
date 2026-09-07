import type { ReactNode } from "react";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { asQuote } from "@/lib/db/identity";
import { CheckoutSettingsProvider } from "./CheckoutSettings";
import "./checkout.css";

export const dynamic = "force-dynamic";

function workerEnv(): CloudflareEnv | null {
  try {
    return getCloudflareContext().env;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "checkout" });
  return { title: t("yourTrip") };
}

export default async function CheckoutLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const env = workerEnv();

  let freeCancelHours: number | null = null;
  let checkoutWindowMinutes: number | null = null;
  if (env) {
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
  }

  const publishableKey =
    env?.STRIPE_PUBLISHABLE_KEY && env.STRIPE_PUBLISHABLE_KEY !== "pk_test_placeholder"
      ? env.STRIPE_PUBLISHABLE_KEY
      : "";

  return (
    <CheckoutSettingsProvider
      value={{
        locale,
        freeCancelHours,
        checkoutWindowMinutes,
        turnstileSiteKey: env?.TURNSTILE_SITE_KEY,
        publishableKey,
      }}
    >
      {children}
    </CheckoutSettingsProvider>
  );
}
