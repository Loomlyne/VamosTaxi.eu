// apps/web/lib/checkout/manage-money.ts
//
// Quick 260929-mbp: the money block and the driver block of the manage-booking page.
// Input is the jsonb from manage_booking_extras / customer_booking_extras. Amounts are the
// booking's SAVED price-snapshot lines, never today's price book; they are shown only when
// they add up to the amount charged (same rule as the pay-link page), otherwise the total alone.
// The driver has exactly four fields: first name, phone, vehicle model, plate.

import { extraLabel, type ExtraNames } from "./extra-label";
import { payLinkLinesForCharge, payLinkLinesFromRows } from "./pay-link-lines";

export const MANAGE_LOCALES = ["en", "de", "fr", "ar"] as const;

/** Methods the page has a name for. Anything else (or null, an old payment) reads "Paid online". */
export const KNOWN_METHODS = ["card", "twint", "apple_pay", "google_pay", "link"] as const;
export type ManageMethod = (typeof KNOWN_METHODS)[number];

export type ManageMoneyLine = {
  kind: "fare" | "surcharge" | "coupon" | "vat";
  code: string;
  /** The owner's name in each page language (names[locale] -> names.en -> humanised code). */
  labels: Record<(typeof MANAGE_LOCALES)[number], string>;
  vatRateBps: number | null;
  /** Negative for a voucher. */
  amountRappen: number;
};

export type ManageMoney = {
  chargedRappen: number;
  method: ManageMethod | null;
  presentment: { amountMinor: number; currency: string } | null;
  className: string;
  lines: ManageMoneyLine[];
  /** 26.2 P6: the change applied last — the class alone, anything else ("trip"), or none. Picks the approved refund line. */
  lastChange: "class" | "trip" | null;
};

export type ManageDriver = {
  firstName: string;
  phone: string;
  vehicleModel: string;
  plate: string;
};

export type ManageExtras = { money: ManageMoney | null; driver: ManageDriver | null };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Stripe type stored by checkout_payment_method_record -> a method the page can name, else null. */
export function methodFromStored(value: unknown): ManageMethod | null {
  const v = text(value);
  return (KNOWN_METHODS as readonly string[]).includes(v) ? (v as ManageMethod) : null;
}

export function moneyFromJson(raw: unknown): ManageMoney | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const charged = Number(rec.charged_rappen);
  if (!Number.isInteger(charged) || charged <= 0) return null;
  const rows = Array.isArray(rec.lines) ? (rec.lines as never[]) : [];
  const lines = payLinkLinesForCharge(payLinkLinesFromRows(rows), charged).map((line) => ({
    kind: line.kind,
    code: line.code,
    labels: Object.fromEntries(
      MANAGE_LOCALES.map((loc) => [loc, extraLabel(line.names as ExtraNames, line.code, loc)]),
    ) as ManageMoneyLine["labels"],
    vatRateBps: line.vatRateBps,
    amountRappen: line.amountRappen,
  }));
  const minor = Number(rec.presentment_amount_minor);
  const currency = text(rec.presentment_currency).toUpperCase();
  const presentment =
    Number.isInteger(minor) && minor > 0 && /^[A-Z]{3}$/.test(currency) && currency !== "CHF"
      ? { amountMinor: minor, currency }
      : null;
  return {
    chargedRappen: charged,
    method: methodFromStored(rec.payment_method_type),
    presentment,
    className: text(rec.vehicle_class_name),
    lines,
    lastChange: rec.last_change === "class" || rec.last_change === "trip" ? rec.last_change : null,
  };
}

/** Exactly four fields, or null. A driver with no first name is treated as not assigned. */
export function driverFromJson(raw: unknown): ManageDriver | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const firstName = text(rec.first_name);
  if (!firstName) return null;
  return {
    firstName,
    phone: text(rec.phone),
    vehicleModel: text(rec.vehicle_model),
    plate: text(rec.plate),
  };
}

export function manageExtrasFromJson(raw: unknown): ManageExtras {
  const rec = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return { money: moneyFromJson(rec.money), driver: driverFromJson(rec.driver) };
}

/** `+41 79 626 70 82` -> `tel:+41796267082`; null when it has no digits. */
export function telHref(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, "");
  return /\d/.test(digits) ? `tel:${digits}` : null;
}
