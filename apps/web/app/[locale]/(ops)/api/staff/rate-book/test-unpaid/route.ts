// apps/web/app/[locale]/(ops)/api/staff/rate-book/test-unpaid/route.ts
//
// POST /api/staff/rate-book/test-unpaid — admin draft unpaid (D-33).
// createBooking analog: no Stripe Checkout session, no mail, is_test true.
// Charge gate still requires a live rate_version id on the snapshot; amounts
// come from the draft priceQuote. Public Pay stays off via the account mapper.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createBooking } from "@/lib/checkout/create-booking";
import { snapshotFareLines } from "@/lib/checkout/lock-to-rpc";
import { zurichLocalToUtcMs } from "@/lib/geo/serviceArea";
import { mintManageToken } from "@/lib/checkout/manage-token";
import { payableWithVatRappen } from "@/lib/checkout/vat";
import { asCheckout, asStaff } from "@/lib/db/identity";
import { mintLockDeadline } from "@/lib/db/quote";
import { parsePreviewBody, priceDraftPreview } from "@/lib/ops/draft-preview";
import { classifyPricingFailure } from "@/lib/ops/rate-book";
import { loadRateVersions } from "@/lib/ops/pricing";
import { jsonErr, jsonOk, withAdmin } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

function emailOk(value: string | null): value is string {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export const POST = withAdmin(async (claims, request) => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonErr("invalid", 400);
  }
  const body = parsePreviewBody(raw);
  if (!body) return jsonErr("invalid", 400);
  const email = body.email;
  if (!emailOk(email)) return jsonErr("email", 400);
  // D-36: the wall clock is Europe/Zurich; store the real instant.
  const scheduledAtMs = zurichLocalToUtcMs(body.when);
  if (scheduledAtMs == null) return jsonErr("invalid", 400);

  const { env } = getCloudflareContext();
  const priced = await priceDraftPreview(env, claims, body);
  const slug = body.classSlug ?? priced.classes.find((row) => row.amount_rappen != null)?.slug ?? null;
  const board = priced.quote.classes.find((row) => row.slug === slug);
  const cls = priced.book.classes.find((row) => row.slug === slug);
  if (!board || !cls || board.total_rappen == null || !board.eligible) {
    return jsonErr("unpriced", 400);
  }
  if (!priced.settingsPolicy) return jsonErr("settings", 400);
  const settingsId = Number(priced.settingsPolicy.settings_version_id);
  if (!Number.isInteger(settingsId) || settingsId <= 0) return jsonErr("settings", 400);

  const versions = await loadRateVersions(env, claims);
  const live = versions.find((row) => row.status === "live");
  if (!live) return jsonErr("not-live", 409);

  const lockExp = await mintLockDeadline(env, settingsId);
  if (!lockExp) return jsonErr("lock", 400);

  const chargedRappen = payableWithVatRappen(board.total_rappen, priced.vatBps);
  const nonce = crypto.randomUUID();
  const token = await mintManageToken();
  const snapshot = {
    vehicle_class_id: cls.id,
    vehicle_class_slug: cls.slug,
    rate_version_id: live.id,
    settings_version_id: settingsId,
    engine_version: priced.quote.engine_version,
    lock_exp: lockExp,
    pax: body.pax,
    bags: body.bags,
    lines: snapshotFareLines(cls.slug, chargedRappen),
    // 26.2 audit (U04-7): rate_version_id above is the live row (the charge gate needs one), but the
    // amounts come from the draft. The snapshot names that draft too, so the row does not misstate
    // which price book produced its figure.
    policy: { ...priced.settingsPolicy, draft_rate_version_id: priced.book.rate_version?.id ?? null },
    shown_alternatives: priced.quote.classes.map((row) => ({
      slug: row.slug,
      total_rappen: row.total_rappen,
    })),
    display_currency: "CHF",
    source: "ops_phone",
    subtotal_rappen: chargedRappen,
    surcharges_rappen: 0,
    discount_rappen: 0,
    total_rappen: chargedRappen,
    distance_km: body.distance_m / 1000,
    duration_min: Math.round(body.duration_s / 60),
    coupon_code: priced.coupon?.code ?? null,
  };
  const legs = [
    {
      leg_seq: 1,
      direction: "outbound",
      pickup_text: body.from,
      pickup_place_id: body.pickup_place_id,
      pickup_lat: body.pickup_lat,
      pickup_lng: body.pickup_lng,
      dropoff_text: body.to,
      dropoff_place_id: body.dropoff_place_id,
      dropoff_lat: body.dropoff_lat,
      dropoff_lng: body.dropoff_lng,
      scheduled_at: new Date(scheduledAtMs).toISOString(),
      scheduled_local: body.when,
      flight_no: null,
      vehicle_class_id: cls.id,
      pax: body.pax,
      bags: body.bags,
      estimated_duration_minutes: Math.max(0, Math.round(body.duration_s / 60)),
    },
  ];

  try {
    const created = await asCheckout(env, null, (tx) =>
      createBooking(tx, {
        quoteId: crypto.randomUUID(),
        idempotencyKey: `test-unpaid-${nonce}`,
        contact: { name: body.contactName, email, phone: "" },
        locale: "en",
        displayCurrency: "CHF",
        snapshot,
        legs,
        couponId: priced.coupon?.id ?? null,
        couponCode: priced.coupon?.code ?? null,
        manageTokenHash: token.hash,
        manageTokenExpiresAt: new Date(lockExp),
        stripePaymentIntentId: `test_unpaid_pi_${nonce}`,
        stripeCheckoutSessionId: `test_unpaid_cs_${nonce}`,
        chargedRappen,
        actorCustomerId: null,
      }),
    );
    await asStaff(env, claims, async (tx) => {
      await tx`update public.bookings set is_test = true where id = ${created.booking_id}`;
      return null;
    });
    return jsonOk({
      bookingId: created.booking_id,
      reference: created.reference,
      is_test: true,
      amount_rappen: chargedRappen,
      lock_exp: lockExp,
    });
  } catch (err) {
    const classified = classifyPricingFailure(err);
    if (classified.kind === "frozen") return jsonErr("not-live", 409);
    if (classified.kind === "duplicate") return jsonErr("duplicate", 409);
    return jsonErr("unknown", 500);
  }
});
