// apps/web/lib/checkout/reprice.ts
//
// D-12: checkout fails closed when the live price book cannot load. Both
// /api/checkout/intent and /api/checkout/pay-link go through this one
// loader instead of each swallowing a rate-book load failure into a
// hard-coded `pricing_live: true`. The tick-box extras are not loaded here:
// loadCheckoutCatalog (checkout-catalog.ts) is their one reader.
//
// pricing_live here follows the quote path's own rule (lib/quote/engine.ts):
// derivePricingLive(rate_version) AND the public_chf launch flag. It is
// never the literal true.

import { loadLaunchFlags as dbLoadLaunchFlags, loadRateBook as dbLoadRateBook, type LaunchFlags } from "../db/quote";
import { derivePricingLive, mapRateBook } from "../pricing/rateBook";

export type CheckoutRepriceDeps = {
  loadRateBook: (env: CloudflareEnv, opts: { preferDraft: boolean }) => Promise<unknown>;
  loadLaunchFlags: (env: CloudflareEnv) => Promise<LaunchFlags>;
};

const DEFAULT_DEPS: CheckoutRepriceDeps = {
  loadRateBook: (env, opts) => dbLoadRateBook(env, opts),
  loadLaunchFlags: (env) => dbLoadLaunchFlags(env),
};

export type CheckoutReprice =
  | {
      ok: true;
      pricingLive: boolean;
      liveRateVersionId: number | null;
    }
  | { ok: false };

/**
 * Loads the live rate book and launch flags. Any throw (rate book load,
 * mapping) becomes `{ ok: false }` — the caller must refuse `pricing_not_live`
 * before opening a Stripe session, never fall back to an empty catalog with
 * pricing left on.
 */
export async function loadCheckoutReprice(
  env: CloudflareEnv,
  deps: CheckoutRepriceDeps = DEFAULT_DEPS,
): Promise<CheckoutReprice> {
  try {
    const rawBook = await deps.loadRateBook(env, { preferDraft: false });
    const book = mapRateBook(rawBook);
    const flags = await deps.loadLaunchFlags(env);
    const live = book.rate_version;
    const liveRateVersionId = live && live.status === "live" ? live.id : null;
    return {
      ok: true,
      pricingLive: derivePricingLive(book.rate_version) && flags.public_chf,
      liveRateVersionId,
    };
  } catch {
    return { ok: false };
  }
}
