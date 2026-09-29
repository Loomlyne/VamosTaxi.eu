// GET /api/checkout/extras — the tick-box extras of the live book, with names in
// en/de/fr/ar. Amounts come from the live rate version. No invented CHF.
// vat_rate_bps is settings via loadLaunchFlags (fallback 81). preferDraft stays false.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { loadCheckoutCatalog } from "@/lib/checkout/checkout-catalog";
import { CH_VAT_RATE_BPS } from "@/lib/checkout/vat";
import { loadLaunchFlags } from "@/lib/db/quote";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const { env } = getCloudflareContext();
    const [catalog, flags] = await Promise.all([loadCheckoutCatalog(env), loadLaunchFlags(env)]);
    return Response.json(
      {
        ok: true,
        extras: catalog.map((row) => ({
          code: row.code,
          amount_rappen: row.amountRappen,
          names: row.labels,
        })),
        vat_rate_bps: flags.vat_rate_bps,
      },
      { headers: HEADERS },
    );
  } catch {
    return Response.json(
      { ok: true, extras: [], vat_rate_bps: CH_VAT_RATE_BPS },
      { headers: HEADERS },
    );
  }
}
