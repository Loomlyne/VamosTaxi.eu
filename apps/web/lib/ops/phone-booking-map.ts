// apps/web/lib/ops/phone-booking-map.ts
//
// 08-06: public pay URL + locale/class helpers. No identity, no Hyperdrive.

import type { EmailLocale, PayLinkVehicle } from "@vamos/emails/confirmation";
import { payLinkPath } from "../checkout/pay-link";

export const PUBLIC_SITE_ORIGIN = "https://vamostaxi.site";

export function publicPayUrl(locale: string, rawToken: string): string {
  return `${PUBLIC_SITE_ORIGIN}${payLinkPath(locale, rawToken)}`;
}

export function payLinkVehicleSlug(raw: string): PayLinkVehicle {
  const s = raw.trim().toLowerCase();
  if (s === "business" || s === "first" || s === "van") return s;
  return "economy";
}

export function clientSecretHex(secret: string): string {
  return Array.from(new TextEncoder().encode(secret), (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
}

export function emailLocale(raw: string): EmailLocale {
  if (raw === "de" || raw === "fr" || raw === "ar") return raw;
  return "en";
}
