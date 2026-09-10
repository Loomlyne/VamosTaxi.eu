// apps/web/lib/checkout/pay-link.ts
//
// D-34…D-38 helpers. No identity, no db, no Stripe.

import type {
  EmailLocale,
  PayLinkExtraCode,
  PayLinkForEmail,
  PayLinkVehicle,
} from "@vamos/emails/confirmation";
import type { QuoteLockExtras, QuoteLockPayload } from "../quote/lock";

export function payLinkPath(locale: string, rawToken: string): string {
  const prefix = !locale || locale === "en" ? "" : `/${locale}`;
  return `${prefix}/checkout/pay/${encodeURIComponent(rawToken)}`;
}

/** D-37: first send wins the 24h clock. */
export function payLinkSentAt(existing: string | null | undefined, nowIso: string): string {
  return existing || nowIso;
}

export function confirmationRecipients(passenger: string, payer: string | null | undefined): string[] {
  const a = passenger.trim().toLowerCase();
  const out = a ? [a] : [];
  const b = (payer ?? "").trim().toLowerCase();
  if (b && b !== a) out.push(b);
  return out;
}

export function companyReady(input: {
  kind: "individual" | "company";
  name: string;
  address: string;
  vat: string;
}): boolean {
  if (input.kind === "individual") return true;
  return Boolean(input.name.trim() && input.address.trim() && input.vat.trim());
}

export function payLinkExtras(extras: QuoteLockExtras | null | undefined): PayLinkExtraCode[] {
  const out: PayLinkExtraCode[] = [];
  if (extras?.child_seats === 1) out.push("child_seat");
  if (extras?.oversized_luggage) out.push("oversized_luggage");
  if ((extras?.extra_stops ?? 0) > 0) out.push("extra_stop");
  return out;
}

const EXTRA_CODES: Record<PayLinkExtraCode, true> = {
  child_seat: true,
  oversized_luggage: true,
  extra_stop: true,
};

/** Snapshot policy extras pinned at intent — names only, no invented CHF. */
export function extrasFromPolicy(policy: unknown): PayLinkExtraCode[] {
  if (!policy || typeof policy !== "object") return [];
  const raw = (policy as { extras?: unknown }).extras;
  if (!Array.isArray(raw)) return [];
  const out: PayLinkExtraCode[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    if (!(item in EXTRA_CODES)) continue;
    const code = item as PayLinkExtraCode;
    if (!out.includes(code)) out.push(code);
  }
  return out;
}

export function payLinkEmailFromLock(args: {
  reference: string;
  locale: EmailLocale;
  payUrl: string;
  totalRappen: number | null;
  payload: QuoteLockPayload | null;
  vehicleClass: PayLinkVehicle;
  extras?: QuoteLockExtras | null;
  coupon: string | null;
  contactName: string;
  contactPhone: string;
  companyName: string;
  companyAddress: string;
  companyVat: string;
}): PayLinkForEmail {
  const leg = args.payload?.legs[0];
  return {
    reference: args.reference,
    locale: args.locale,
    payUrl: args.payUrl,
    totalRappen: args.totalRappen,
    pickupText: leg?.pickup.text ?? "",
    dropoffText: leg?.dropoff.text ?? "",
    scheduledLocal: leg?.scheduled_local ?? "",
    flightNo: leg?.flight_no ?? null,
    vehicleClass: args.vehicleClass,
    pax: args.payload?.pax ?? 0,
    bags: args.payload?.bags ?? 0,
    extras: payLinkExtras(args.extras ?? args.payload?.extras),
    coupon: args.coupon,
    contactName: args.contactName,
    contactPhone: args.contactPhone,
    companyName: args.companyName,
    companyAddress: args.companyAddress,
    companyVat: args.companyVat,
  };
}
