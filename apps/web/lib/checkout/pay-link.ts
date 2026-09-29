// apps/web/lib/checkout/pay-link.ts
//
// D-34…D-38 helpers. No identity, no db, no Stripe.

import type {
  EmailExtraLine,
  EmailLocale,
  PayLinkExtraCode,
  PayLinkForEmail,
  PayLinkVehicle,
} from "@vamos/emails/confirmation";
import type { QuoteLockExtras, QuoteLockPayload } from "../quote/lock";
import { humaniseCode } from "./extras-catalog";

const EMAIL_LOCALES = ["en", "de", "fr", "ar"] as const;

function text(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

/** One snapshot line as the checkout_booking_for_email RPC returns it (jsonb, snake_case). */
export type SnapshotLineJson = {
  kind?: unknown;
  code?: unknown;
  i18n_key?: unknown;
  params?: unknown;
  amount_rappen?: unknown;
};

export function snapshotLines(value: unknown): SnapshotLineJson[] {
  return Array.isArray(value)
    ? value.filter((v): v is SnapshotLineJson => v != null && typeof v === "object")
    : [];
}

/** A surcharge line's per-language names (D-35: any name the owner typed, never a closed list). */
export function surchargeNames(line: SnapshotLineJson): Partial<Record<EmailLocale, string>> {
  const params = line.params && typeof line.params === "object" ? (line.params as Record<string, unknown>) : {};
  const raw = params.names && typeof params.names === "object" ? (params.names as Record<string, unknown>) : {};
  const out: Partial<Record<EmailLocale, string>> = {};
  for (const l of EMAIL_LOCALES) {
    const name = text(raw[l]);
    if (name) out[l] = name;
  }
  return out;
}

/** names[locale] ?? names.en ?? params.name ?? humanised code. */
export function surchargeLabel(line: SnapshotLineJson, locale: EmailLocale): string {
  const names = surchargeNames(line);
  const params = line.params && typeof line.params === "object" ? (line.params as Record<string, unknown>) : {};
  return names[locale] || names.en || text(params.name) || humaniseCode(text(line.code));
}

/** The lines that are ticked extras: neither fare, coupon/discount nor VAT. */
export function isSurchargeLine(line: SnapshotLineJson): boolean {
  const kind = text(line.kind);
  const code = text(line.code);
  if (kind === "fare" || kind === "vat" || kind === "coupon" || kind === "discount") return false;
  if (code === "coupon" || code === "discount" || code === "vat") return false;
  return Number(line.amount_rappen) !== 0;
}

/** Extras for the e-mails, straight from the booking's snapshot lines (D-44). */
export function emailExtrasFromLines(lines: unknown, locale: EmailLocale): EmailExtraLine[] {
  return snapshotLines(lines)
    .filter(isSurchargeLine)
    .map((line) => ({
      name: surchargeLabel(line, locale),
      names: surchargeNames(line),
      amountRappen: Number.isFinite(Number(line.amount_rappen)) ? Number(line.amount_rappen) : null,
    }));
}

const LEGACY_EXTRA_NAMES: Record<string, Partial<Record<EmailLocale, string>>> = {
  "child_seat": {
    "en": "Child seat",
    "de": "Kindersitz",
    "fr": "Siège enfant",
    "ar": "مقعد طفل"
  },
  "oversized_luggage": {
    "en": "Oversized luggage",
    "de": "Sperrgepäck",
    "fr": "Bagage hors format",
    "ar": "أمتعة كبيرة"
  },
  "extra_stop": {
    "en": "Extra stop",
    "de": "Zwischenstopp",
    "fr": "Arrêt supplémentaire",
    "ar": "توقف إضافي"
  }
};

/** A code from a pre-26.3 snapshot with its old three-language names; unknown codes are humanised. */
function legacyExtra(code: string): EmailExtraLine {
  const names = LEGACY_EXTRA_NAMES[code];
  return { name: names?.en ?? humaniseCode(code), ...(names ? { names } : {}), amountRappen: null };
}

/** Snapshots written before lines carried names: only the policy's extra codes exist. */
export function emailExtrasFromPolicy(policyExtras: unknown): EmailExtraLine[] {
  return extrasFromPolicy({ extras: policyExtras }).map(legacyExtra);
}

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

/** @deprecated 26.3 — closed three-code list; plan 09/21 remove the remaining readers. */
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

/** @deprecated 26.3 — legacy policy codes only; use {@link emailExtrasFromLines}. */
export function extrasFromPolicy(policy: unknown): PayLinkExtraCode[] {
  if (!policy || typeof policy !== "object") return [];
  const raw = (policy as { extras?: unknown }).extras;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return payLinkExtras(raw as QuoteLockExtras);
  }
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
  /** Generic extras by name; wins over the legacy `extras` codes when given. */
  extraLines?: EmailExtraLine[];
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
    extras:
      args.extraLines ??
      payLinkExtras(args.extras ?? args.payload?.extras).map(legacyExtra),
    coupon: args.coupon,
    contactName: args.contactName,
    contactPhone: args.contactPhone,
    companyName: args.companyName,
    companyAddress: args.companyAddress,
    companyVat: args.companyVat,
  };
}
