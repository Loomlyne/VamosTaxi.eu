export const dynamic = "force-dynamic";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { hashManageToken } from "@/lib/checkout/manage-token";
import { asGuest, asSystem } from "@/lib/db/identity";

const NOT_FOUND =
  "We could not find this booking. Check the link in your confirmation email.";
const GONE = "This booking is gone. Start a new trip from home.";

const UNPAID = new Set(["quote", "pending"]);
const HIDE_CANCEL = new Set(["completed", "no_show", "cancelled", "partially_cancelled"]);

type ReadRow = {
  booking_id: string;
  reference: string | null;
  status: string;
  locale: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  pickup_text: string | null;
  dropoff_text: string | null;
  scheduled_at: string | Date | null;
  scheduled_local: string | null;
  original_scheduled_at: string | Date | null;
  flight_no: string | null;
  pax: number | string | null;
  bags: number | string | null;
  refund_status: string | null;
  refund_owed_rappen: number | string | null;
  refunded_rappen: number | string | null;
  payout_country: string | null;
  available_on: string | Date | null;
};

type ExtraRow = {
  chauffeur_name: string | null;
  vehicle: string | null;
  plate: string | null;
  review_submitted: boolean | null;
};

function json(body: unknown, status = 200): Response {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function isNotFound(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const rec = err as { code?: unknown; message?: unknown };
  if (rec.code === "P0002") return true;
  const message = typeof rec.message === "string" ? rec.message : "";
  return message === "not_found" || message === "not-found";
}

function str(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function iso(value: string | Date | null | undefined): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  return str(value) || null;
}

function countryLabel(isoCode: string | null | undefined): string {
  const code = str(isoCode).toUpperCase();
  if (!code) return "Switzerland";
  try {
    const name = new Intl.DisplayNames(["en"], { type: "region" }).of(code);
    return name || "Switzerland";
  } catch {
    return "Switzerland";
  }
}

function hoursBefore(original: string | Date | null, now: Date): number {
  const stamp = original instanceof Date ? original.getTime() : Date.parse(str(original));
  if (!Number.isFinite(stamp)) return 0;
  return (stamp - now.getTime()) / 3_600_000;
}

function cancelWindow(hours: number): "auto_full" | "pending_ops" | "none" {
  if (hours > 24) return "auto_full";
  if (hours > 6) return "pending_ops";
  return "none";
}

export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const tokenHashHex = token ? await hashManageToken(token) : "";
  if (!tokenHashHex) return json({ ok: false, code: "not-found", error: NOT_FOUND }, 404);

  const { env } = await getCloudflareContext({ async: true });
  let row: ReadRow | undefined;
  try {
    row = await asGuest(env, tokenHashHex, async (sql) => {
      const rows = await sql<ReadRow[]>`
        select * from public.manage_booking_read(decode(${tokenHashHex}, 'hex'))
      `;
      return rows[0];
    });
  } catch (err) {
    if (isNotFound(err)) return json({ ok: false, code: "not-found", error: NOT_FOUND }, 404);
    return json({ ok: false, code: "unknown", error: NOT_FOUND }, 500);
  }
  if (!row?.booking_id) return json({ ok: false, code: "not-found", error: NOT_FOUND }, 404);

  const status = str(row.status).toLowerCase();
  if (UNPAID.has(status)) {
    return json({ ok: false, code: "gone", error: GONE }, 404);
  }

  let extra: ExtraRow | undefined;
  try {
    extra = await asSystem(env, async (sql) => {
      const rows = await sql<ExtraRow[]>`
        select
          ch.full_name as chauffeur_name,
          v.model as vehicle,
          v.plate as plate,
          exists(
            select 1 from public.reviews as r where r.booking_id = b.id
          ) as review_submitted
          from public.bookings as b
          join public.booking_legs as l
            on l.booking_id = b.id
           and l.leg_seq = 1
          left join public.chauffeurs as ch on ch.id = l.assigned_chauffeur_id
          left join public.vehicles as v on v.id = l.assigned_vehicle_id
         where b.id = ${row.booking_id}::uuid
         limit 1
      `;
      return rows[0];
    });
  } catch {
    extra = undefined;
  }

  const reviewSubmitted = Boolean(extra?.review_submitted);
  const refundStatus = str(row.refund_status) || "none";
  const refunded = refundStatus === "refunded";
  const payoutCountry = str(row.payout_country).toUpperCase() || (refunded ? "CH" : "");
  const windowKind = cancelWindow(hoursBefore(row.original_scheduled_at, new Date()));
  const canCancel = !HIDE_CANCEL.has(status) && !reviewSubmitted;

  return json({
    ok: true,
    booking: {
      id: row.booking_id,
      reference: str(row.reference),
      status,
      locale: str(row.locale) || "en",
      contactName: str(row.contact_name),
      pickupText: str(row.pickup_text),
      dropoffText: str(row.dropoff_text),
      scheduledLocal: str(row.scheduled_local),
      originalScheduledAt: iso(row.original_scheduled_at),
      flightNo: str(row.flight_no),
      pax: num(row.pax) || 1,
      bags: num(row.bags),
      chauffeurName: str(extra?.chauffeur_name),
      vehicle: str(extra?.vehicle),
      plate: str(extra?.plate),
      refundStatus,
      refundOwedRappen: num(row.refund_owed_rappen),
      refundedRappen: num(row.refunded_rappen),
      payoutCountry: payoutCountry || null,
      payoutCountryLabel: refunded ? countryLabel(payoutCountry || "CH") : null,
      availableOn: refunded ? iso(row.available_on) : null,
      reviewSubmitted,
      canCancel,
      cancelWindow: windowKind,
    },
  });
}
