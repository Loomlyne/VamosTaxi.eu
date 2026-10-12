// J5 (W3-06): the quote id of an UNPAID booking, for the confirmation page's FINISH PAYMENT link
// (`/checkout?resume=<quote_id>`). Behind the booking's own manage cookie only
// (public.guest_resume_quote). Fail closed: any error, or the function missing before the
// migration is applied, answers null and the page shows no finish link.

import { asGuest } from "../db/identity";
import { BOOKING_REFERENCE_RE } from "./booking-status";
import { hashManageToken } from "./manage-token";
import { localePath } from "./steps";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function readResumeQuoteId(
  env: CloudflareEnv,
  rawCookie: string,
  reference: string,
): Promise<string | null> {
  if (!rawCookie || !BOOKING_REFERENCE_RE.test(reference)) return null;
  try {
    const hashHex = await hashManageToken(rawCookie);
    if (!hashHex) return null;
    const rows = await asGuest(env, hashHex, (sql) =>
      sql<{ quote: string | null }[]>`
        select public.guest_resume_quote(${reference}, decode(${hashHex}, 'hex')) as quote
      `,
    );
    const quote = String(rows[0]?.quote ?? "");
    return UUID_RE.test(quote) ? quote.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** FINISH PAYMENT target: the checkout with this booking's quote to resume. */
export function finishPaymentHref(locale: string, quoteId: string | null): string | null {
  if (!quoteId || !UUID_RE.test(quoteId)) return null;
  return `${localePath(locale, "/checkout")}?resume=${encodeURIComponent(quoteId.toLowerCase())}`;
}
