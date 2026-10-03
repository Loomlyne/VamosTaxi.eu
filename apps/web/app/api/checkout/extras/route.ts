// GET /api/checkout/extras — the tick-box extras of the live book, with names in
// en/de/fr/ar. Amounts come from the live rate version. No invented CHF.
// vat_rate_bps is settings via loadLaunchFlags. preferDraft stays false.
// A database failure answers 503 { ok: false } — never an empty list that reads as "no extras".

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { loadCheckoutCatalog } from "@/lib/checkout/checkout-catalog";
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
    // 26.2 audit U11-6: an outage is not an empty price book. The client keeps the
    // extras it already has and the intent fails closed on the same read.
    return Response.json({ ok: false }, { status: 503, headers: HEADERS });
  }
}
