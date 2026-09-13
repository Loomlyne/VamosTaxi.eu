// apps/web/app/[locale]/(ops)/api/staff/rate-book/preview/route.ts
//
// POST /api/staff/rate-book/preview — admin draft recap (D-05 D-29).
// asStaff draft book → priceQuote. Never Stripe. Never public preferDraft.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { parsePreviewBody, priceDraftPreview } from "@/lib/ops/draft-preview";
import { jsonErr, jsonOk, withAdmin } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

export const POST = withAdmin(async (claims, request) => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonErr("invalid", 400);
  }
  const body = parsePreviewBody(raw);
  if (!body) return jsonErr("invalid", 400);
  const { env } = getCloudflareContext();
  const priced = await priceDraftPreview(env, claims, body);
  return jsonOk({
    vatRateBps: priced.vatBps,
    coupon: priced.coupon ? priced.coupon.code : null,
    classes: priced.classes,
  });
});
