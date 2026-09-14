// apps/web/lib/ops/draft-preview.ts
//
// Shared parse + recap for admin draft preview / test unpaid (D-05 D-29 D-33).
// Never Stripe. Never public preferDraft.

import { asStaff, type VamosClaims } from "../db/identity";
import { CH_VAT_RATE_BPS, payableWithVatRappen, vatOnTopRappen } from "../checkout/vat";
import { snapshotPolicyFromSettings } from "../checkout/lock-to-rpc";
import { mapSettingsSnapshot } from "../pricing/rateBook";
import { priceQuote } from "../pricing/priceQuote";
import type { CouponFacts, SettingsVersionRow } from "../pricing/policy";
import { perKm } from "../pricing/round";
import type { ClassBoardEntry, QuoteInput, RateBook } from "../pricing/types";
import { loadDraftQuoteBookDoc } from "./rate-book";
import { mapRateBook } from "../pricing/rateBook";

export type RecapLine = { code: string; amount_rappen: number | null };

export type PreviewClass = {
  slug: string;
  eligible: boolean;
  amount_rappen: number | null;
  recap: RecapLine[];
};

export type PreviewBody = {
  from: string;
  to: string;
  when: string;
  pax: number;
  bags: number;
  classSlug: string | null;
  extras: Record<string, number>;
  coupon: string | null;
  distance_m: number;
  duration_s: number;
  origin_zone_id: string | null;
  dest_zone_id: string | null;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  pickup_place_id: string | null;
  dropoff_place_id: string | null;
  email: string | null;
  contactName: string;
};

function rec(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function num(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function optionalStr(value: unknown): string | null {
  const s = str(value);
  return s === "" ? null : s;
}

function extrasOf(value: unknown): Record<string, number> {
  const obj = rec(value);
  if (!obj) return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(obj)) {
    const n = num(raw, NaN);
    if (Number.isFinite(n) && n > 0) out[key] = n;
  }
  return out;
}

export function parsePreviewBody(raw: unknown): PreviewBody | null {
  const body = rec(raw);
  if (!body) return null;
  const from = str(body.from) || str(body.pickup) || str(body.pickup_text);
  const to = str(body.to) || str(body.dropoff) || str(body.dropoff_text);
  const when = str(body.when) || str(body.scheduled_local);
  if (!from || !to || !when) return null;
  const pax = Math.max(1, Math.trunc(num(body.pax, 1)));
  return {
    from,
    to,
    when,
    pax,
    bags: Math.max(0, Math.trunc(num(body.bags, 0))),
    classSlug: optionalStr(body.class) ?? optionalStr(body.classSlug) ?? optionalStr(body.vehicle_class),
    extras: extrasOf(body.extras),
    coupon: optionalStr(body.coupon),
    distance_m: Math.max(0, Math.trunc(num(body.distance_m, num(body.distanceM, 0)))),
    duration_s: Math.max(0, Math.trunc(num(body.duration_s, num(body.durationS, 0)))),
    origin_zone_id: optionalStr(body.origin_zone_id) ?? optionalStr(body.originZoneId),
    dest_zone_id: optionalStr(body.dest_zone_id) ?? optionalStr(body.destZoneId),
    pickup_lat: num(body.pickup_lat, 0),
    pickup_lng: num(body.pickup_lng, 0),
    dropoff_lat: num(body.dropoff_lat, 0),
    dropoff_lng: num(body.dropoff_lng, 0),
    pickup_place_id: optionalStr(body.pickup_place_id) ?? optionalStr(body.mapboxFrom),
    dropoff_place_id: optionalStr(body.dropoff_place_id) ?? optionalStr(body.mapboxTo),
    email: optionalStr(body.email) ?? optionalStr(body.contact_email),
    contactName: str(body.contact_name) || str(body.name) || "Test unpaid",
  };
}

function quoteInputOf(body: PreviewBody, computedAt: string): QuoteInput {
  return {
    mode: "one_way",
    pax: body.pax,
    bags: body.bags,
    display_currency: "CHF",
    computed_at: computedAt,
    extras: body.extras,
    coupon: body.coupon,
    legs: [
      {
        leg_seq: 1,
        scheduled_local: body.when,
        distance_m: body.distance_m,
        duration_s: body.duration_s,
        origin_zone_id: body.origin_zone_id,
        dest_zone_id: body.dest_zone_id,
        waypoints: [],
      },
    ],
  };
}

export function recapForClass(entry: ClassBoardEntry, vatBps: number): RecapLine[] {
  const empty: RecapLine[] = [
    { code: "start", amount_rappen: null },
    { code: "km", amount_rappen: null },
    { code: "bands", amount_rappen: null },
    { code: "region", amount_rappen: null },
    { code: "extras", amount_rappen: null },
    { code: "vat", amount_rappen: null },
    { code: "total", amount_rappen: null },
  ];
  if (!entry.eligible || entry.total_rappen == null) return empty;

  const fare = entry.lines.find((line) => line.kind === "fare");
  const basis = (fare?.basis ?? {}) as Record<string, unknown>;
  const start =
    typeof basis.base_fare_rappen === "number" && Number.isFinite(basis.base_fare_rappen)
      ? basis.base_fare_rappen
      : null;
  const perKmR =
    typeof basis.per_km_rappen === "number" && Number.isFinite(basis.per_km_rappen)
      ? basis.per_km_rappen
      : null;
  const distanceM =
    typeof basis.distance_m === "number" && Number.isFinite(basis.distance_m)
      ? basis.distance_m
      : 0;
  const km = start != null && perKmR != null ? perKm(perKmR, distanceM) : null;
  const fareAmt = fare?.amount_rappen ?? null;
  const bands =
    fareAmt != null && start != null && km != null ? fareAmt - start - km : null;
  let region = 0;
  let extras = 0;
  for (const line of entry.lines) {
    if (line.code === "region_premium" && line.amount_rappen != null) region += line.amount_rappen;
    if (line.kind === "extra" && line.amount_rappen != null) extras += line.amount_rappen;
  }
  const net = entry.total_rappen;
  const vat = vatOnTopRappen(net, vatBps);
  return [
    { code: "start", amount_rappen: start },
    { code: "km", amount_rappen: km },
    { code: "bands", amount_rappen: bands },
    { code: "region", amount_rappen: region },
    { code: "extras", amount_rappen: extras },
    { code: "vat", amount_rappen: vat },
    { code: "total", amount_rappen: payableWithVatRappen(net, vatBps) },
  ];
}

export function draftVatBps(rawBook: unknown): number {
  if (!rawBook || typeof rawBook !== "object" || Array.isArray(rawBook)) return CH_VAT_RATE_BPS;
  const rv = (rawBook as { rate_version?: { vat_rate_bps?: unknown } }).rate_version;
  const bps = rv?.vat_rate_bps;
  if (typeof bps === "number" && Number.isFinite(bps) && bps >= 0) return Math.trunc(bps);
  if (typeof bps === "string" && bps.trim() !== "") {
    const n = Number(bps);
    if (Number.isFinite(n) && n >= 0) return Math.trunc(n);
  }
  return CH_VAT_RATE_BPS;
}

export async function loadSettingsRows(
  env: CloudflareEnv,
  claims: VamosClaims,
  computedAt: string,
): Promise<{ rows: SettingsVersionRow[]; doc: unknown }> {
  const doc = await asStaff(env, claims, async (tx) => {
    const rows = await tx<{ result: unknown }[]>`
      select to_jsonb(sv) as result
        from public.settings_versions as sv
       where sv.effective_from <= ${computedAt}::timestamptz
       order by sv.effective_from desc, sv.id desc
       limit 1
    `;
    return rows[0]?.result ?? null;
  });
  const snap = mapSettingsSnapshot(doc);
  if (!snap) return { rows: [], doc };
  const row: SettingsVersionRow = {
    ...snap,
    night_window_tz: snap.night_window_tz ?? "Europe/Zurich",
    cancellation_tiers: Array.isArray(snap.cancellation_tiers) ? snap.cancellation_tiers : [],
    effective_from: snap.effective_from ?? computedAt,
  };
  return { rows: [row], doc };
}

export async function loadDraftCouponFacts(
  env: CloudflareEnv,
  claims: VamosClaims,
  versionId: number | null,
  code: string | null,
  computedAt: string,
): Promise<CouponFacts | null> {
  if (!code || versionId == null) return null;
  const trimmed = code.trim();
  if (!trimmed) return null;
  return asStaff(env, claims, async (tx) => {
    const rows = await tx<
      {
        id: number;
        code: string;
        kind: "percent" | "amount";
        percent: number | string | null;
        amount_rappen: number | null;
        active: boolean;
        valid_from: Date | string | null;
        valid_until: Date | string | null;
      }[]
    >`
      select id, code, kind, percent, amount_rappen, active, valid_from, valid_until
        from public.coupons
       where rate_version_id = ${versionId}
         and lower(btrim(code)) = lower(${trimmed})
         and active = true
       limit 1
    `;
    const row = rows[0];
    if (!row) return null;
    const from = row.valid_from == null ? null : new Date(row.valid_from).toISOString();
    const until = row.valid_until == null ? null : new Date(row.valid_until).toISOString();
    if (from && from > computedAt) return null;
    if (until && until < computedAt) return null;
    return {
      id: Number(row.id),
      code: trimmed,
      kind: row.kind,
      percent: row.percent,
      amount_rappen: row.amount_rappen,
    };
  });
}

export async function priceDraftPreview(
  env: CloudflareEnv,
  claims: VamosClaims,
  body: PreviewBody,
): Promise<{
  book: RateBook;
  vatBps: number;
  settingsDoc: unknown;
  settingsPolicy: Record<string, unknown> | null;
  coupon: CouponFacts | null;
  classes: PreviewClass[];
  quote: ReturnType<typeof priceQuote>;
}> {
  const computedAt = new Date().toISOString();
  const rawBook = await loadDraftQuoteBookDoc(env, claims);
  const book = mapRateBook(rawBook);
  const vatBps = draftVatBps(rawBook);
  const { rows: settingsRows, doc: settingsDoc } = await loadSettingsRows(env, claims, computedAt);
  const versionId = book.rate_version?.id ?? null;
  const coupon = await loadDraftCouponFacts(env, claims, versionId, body.coupon, computedAt);
  const quote = priceQuote(book, settingsRows, quoteInputOf(body, computedAt), { coupon });
  const classes = quote.classes.map((entry) => ({
    slug: entry.slug,
    eligible: entry.eligible,
    amount_rappen: entry.eligible ? entry.total_rappen : null,
    recap: recapForClass(entry, vatBps),
  }));
  return {
    book,
    vatBps,
    settingsDoc,
    settingsPolicy: snapshotPolicyFromSettings(settingsDoc),
    coupon,
    classes,
    quote,
  };
}
