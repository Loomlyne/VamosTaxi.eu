// apps/web/lib/checkout/voucher-lock.ts
//
// A voucher typed on /checkout has to be inside the signed quote lock, because
// /api/checkout/intent refuses a body voucher the lock does not carry (the safety
// check in intent.ts). 26.2 audit U11-1: the page used to price the voucher from
// the body alone, so the screen showed a discount PAY then refused. The page now
// re-signs the lock through /api/quote/reprice with `coupon` and sends that lock to
// both the price call and PAY. Without a voucher the unsigned lock is used as it is.

import { parseQuoteJson } from "./checkout-quote";

/** The lock that was re-signed for one voucher on top of one base lock. */
export type VoucherLock = { base: string; voucher: string; lock: string };

/**
 * The lock a price call or PAY must send. No voucher: the base lock. A voucher:
 * the re-signed lock, but only while it was made from this base lock for this
 * voucher; otherwise null (nothing signed yet, or the quote moved on).
 */
export function lockForVoucher(base: string, voucher: string | null, held: VoucherLock | null): string | null {
  if (!voucher) return base;
  return held && held.base === base && held.voucher === voucher ? held.lock : null;
}

export type SignVoucherArgs = {
  quoteId: string;
  lock: string;
  voucher: string;
  locale: string;
  displayCurrency: "CHF" | "EUR" | "USD" | "AED";
  preferredClass: string | null;
};

export type SignVoucherResult = { ok: true; lock: string } | { ok: false; code: string };

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Same call shape as the flight re-sign in CheckoutPage, plus `coupon`. The server prices nothing it was not told by the lock. */
export async function signVoucherLock(fetchImpl: FetchLike, args: SignVoucherArgs): Promise<SignVoucherResult> {
  try {
    const res = await fetchImpl("/api/quote/reprice", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        quote_id: args.quoteId,
        lock: args.lock,
        locale: args.locale,
        display_currency: args.displayCurrency,
        ...(args.preferredClass ? { preferred_class: args.preferredClass } : {}),
        coupon: args.voucher,
      }),
    });
    const result = parseQuoteJson(res.status, await res.json().catch(() => null));
    if (result.kind === "ok") return { ok: true, lock: result.lock };
    return { ok: false, code: result.code };
  } catch {
    return { ok: false, code: "network" };
  }
}
