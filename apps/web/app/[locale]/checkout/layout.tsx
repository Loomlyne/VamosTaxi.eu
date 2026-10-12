import type { ReactNode } from "react";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { loadSettingsVersion } from "@/lib/db/quote";
import { accountCreateAvailable, guestAccountsOn } from "@/lib/checkout/account-notice";
import { policyHours } from "@/lib/checkout/policy-settings";
import { checkoutPaymentMethodTypes } from "@/lib/checkout/payment-methods";
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

  let guestOn = false;
  let createOn = false;
  if (env) {
    try {
      createOn = accountCreateAvailable(env);
      guestOn = await guestAccountsOn(env);
    } catch {
      guestOn = false;
      createOn = false;
    }
  }

  return (
    <CheckoutSettingsProvider
      value={{
        locale,
        freeCancelHours,
        checkoutWindowMinutes,
        turnstileSiteKey: env?.TURNSTILE_SITE_KEY ?? process.env.TURNSTILE_SITE_KEY,
        twintOn: env ? checkoutPaymentMethodTypes(env).includes("twint") : false,
        guestAccountsOn: guestOn,
        accountCreateAvailable: createOn,
      }}
    >
      {children}
    </CheckoutSettingsProvider>
  );
}
