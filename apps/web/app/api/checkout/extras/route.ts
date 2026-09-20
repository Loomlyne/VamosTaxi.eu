// GET /api/checkout/extras — live book extras the passenger card can paint.
// Amounts come from the live rate version. No invented CHF.
// vat_rate_bps is settings via loadLaunchFlags (fallback 81). preferDraft stays false.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { catalogFromSurcharges, publishedMaxExtraStops } from "@/lib/checkout/extras-catalog";
import { CH_VAT_RATE_BPS } from "@/lib/checkout/vat";
import { loadLaunchFlags, loadRateBook } from "@/lib/db/quote";
import { mapRateBook } from "@/lib/pricing/rateBook";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { env } = getCloudflareContext();
    const [raw, flags] = await Promise.all([
      loadRateBook(env, { preferDraft: false }),
      loadLaunchFlags(env),
    ]);
    const book = mapRateBook(raw);
    const maxStops = publishedMaxExtraStops(
      raw && typeof raw === "object" && "rate_version" in raw
        ? (raw as { rate_version?: { max_extra_stops?: unknown } }).rate_version
            ?.max_extra_stops
        : null,
    );
    return Response.json(
      {
        ok: true,
        extras: catalogFromSurcharges(book.surcharges),
        vat_rate_bps: flags.vat_rate_bps,
        max_extra_stops: maxStops,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json(
      {
        ok: true,
        extras: [],
        vat_rate_bps: CH_VAT_RATE_BPS,
        max_extra_stops: 0,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
