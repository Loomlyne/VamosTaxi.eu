// apps/web/lib/checkout/lock-mail.ts
//
// D-24: skip-send price-changed (Publish) and expired (lock deadline).
// Owner English is TBC — sendPriceChanged / sendExpired never invent a body.
// Unpaid non-test contacts only. Old locked CHF only. is_test: no mails.

import { sendExpired, sendPriceChanged, type EmailLocale } from "@vamos/emails/confirmation";
import { loadExpiredBookingContact, loadPriceChangedUnpaidContacts } from "../db/system-reads";

type ContactRow = {
  id: string;
  contact_email: string | null;
  locale: string | null;
  is_test: boolean | null;
  locked_rappen: number | string | null;
};

function asEmailLocale(locale: string): EmailLocale {
  if (locale === "de" || locale === "fr" || locale === "ar") return locale;
  return "en";
}

async function skipSendContacts(
  env: CloudflareEnv,
  rows: ContactRow[],
  kind: "price_changed" | "expired",
): Promise<number> {
  let n = 0;
  const key = env.RESEND_API_KEY ?? "";
  for (const row of rows) {
    if (row.is_test === true) continue;
    const email = String(row.contact_email ?? "").trim();
    if (!email) continue;
    const locked = Number(row.locked_rappen ?? 0);
    if (!Number.isFinite(locked) || locked < 0) continue;
    const input = {
      locale: asEmailLocale(String(row.locale ?? "en")),
      contactEmail: email,
      lockedRappen: Math.trunc(locked),
    };
    if (kind === "price_changed") {
      await sendPriceChanged({ RESEND_API_KEY: key }, input);
    } else {
      await sendExpired({ RESEND_API_KEY: key }, input);
    }
    n += 1;
  }
  return n;
}

export async function notifyPriceChangedForUnpaid(env: CloudflareEnv): Promise<number> {
  const rows = await loadPriceChangedUnpaidContacts(env);
  return skipSendContacts(env, rows, "price_changed");
}

export async function notifyExpiredForBookings(
  env: CloudflareEnv,
  bookingIds: string[],
): Promise<number> {
  if (bookingIds.length === 0) return 0;
  const rows: ContactRow[] = [];
  for (const id of bookingIds) {
    const found = await loadExpiredBookingContact(env, id);
    if (found) rows.push(found);
  }
  return skipSendContacts(env, rows, "expired");
}
