import type { ReactNode } from "react";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { loadSettingsVersion } from "@/lib/db/quote";
import { policyHours } from "@/lib/checkout/policy-settings";
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
  return { title: t("yourTrip"), robots: { index: false, follow: false } };
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
      const policy = policyHours(await loadSettingsVersion(env, new Date().toISOString()));
      freeCancelHours = policy.freeCancelHours;
      checkoutWindowMinutes = policy.checkoutWindowMinutes;
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
