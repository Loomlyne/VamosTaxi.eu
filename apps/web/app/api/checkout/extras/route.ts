// GET /api/checkout/extras — live book extras the passenger card can paint.
// Amounts come from the live rate version. No invented CHF.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { catalogFromSurcharges } from "@/lib/checkout/extras-catalog";
import { loadRateBook } from "@/lib/db/quote";
import { mapRateBook } from "@/lib/pricing/rateBook";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { env } = getCloudflareContext();
    const raw = await loadRateBook(env, { preferDraft: false });
    const book = mapRateBook(raw);
    return Response.json(
      { ok: true, extras: catalogFromSurcharges(book.surcharges) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ ok: true, extras: [] });
  }
}
