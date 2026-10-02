export const dynamic = "force-dynamic";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { customerClaims } from "@/lib/account/session";
import { customerCanCancel } from "@/lib/checkout/cancel-window";
import { manageExtrasFromJson } from "@/lib/checkout/manage-money";
import { asCustomer, asSystem } from "@/lib/db/identity";

const noStore = { "Cache-Control": "private, no-store" };

/** An unpaid booking has nothing captured, so the paid cancel refuses it: no Cancel is offered. */
const UNPAID: readonly string[] = Object.freeze(["quote", "pending"]);

/**
 * Money, driver, status and cancel window for one of the signed-in customer's bookings (manage-booking
 * opened from the account). Ownership is decided inside customer_booking_extras from the JWT e-mail; a miss is a
 * plain null, so a reference that is not theirs looks the same as one that does not exist.
 */
export async function GET(request: Request) {
  const claims = await customerClaims(request);
  if (!claims?.email) {
    return NextResponse.json({ ok: false }, { status: 401, headers: noStore });
  }
  const reference = (new URL(request.url).searchParams.get("ref") ?? "").replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z0-9-]{4,32}$/.test(reference)) {
    return NextResponse.json({ ok: false }, { status: 404, headers: noStore });
  }
  const email = claims.email;
  const { env } = await getCloudflareContext({ async: true });
  try {
    type Answer = {
      extras: unknown;
      bookingId: string;
      status: string;
      reviewSubmitted: boolean;
      refundStatus: string;
      refundOwedRappen: number;
      refundedRappen: number;
    } | null;
    const payload = await asCustomer(env, claims, async (sql): Promise<Answer> => {
      const rows = await sql<{ payload: unknown }[]>`
        select public.customer_booking_extras(${reference}) as payload
      `;
      const extras = rows[0]?.payload;
      if (!extras) return null;
      // 20-10: the refund row and box of the booking page. Same ownership rule as the account list
      // (the signed-in e-mail). Readable as `authenticated` through the column grant of
      // 20260911234758 (refund_status, refund_owed_rappen, refunded_rappen).
      // 26.2 P1: refunded_rappen too (same grant), so the page shows what is still due after a cheaper class.
      // 261002: id, status and has_review too (the account list reads the same columns and reviews), so the
      // booking page shows the real status and decides on Cancel; id feeds the cancel-window read below.
      const refund = await sql<
        {
          id: string | null;
          status: string | null;
          has_review: boolean | null;
          refund_status: string | null;
          refund_owed_rappen: number | string | null;
          refunded_rappen: number | string | null;
        }[]
      >`
        select b.id,
               b.status::text as status,
               exists (select 1 from public.reviews r where r.booking_id = b.id) as has_review,
               b.refund_status::text as refund_status,
               b.refund_owed_rappen,
               b.refunded_rappen
          from public.bookings as b
         where b.reference = ${reference}
           and lower(b.contact_email::text) = lower(${email})
         limit 1
      `;
      const owed = Number(refund[0]?.refund_owed_rappen ?? 0);
      const refunded = Number(refund[0]?.refunded_rappen ?? 0);
      return {
        extras,
        bookingId: refund[0]?.id ? String(refund[0].id) : "",
        status: refund[0]?.status ? String(refund[0].status).toLowerCase() : "",
        reviewSubmitted: refund[0]?.has_review === true,
        refundStatus: refund[0]?.refund_status ? String(refund[0].refund_status) : "none",
        refundOwedRappen: Number.isFinite(owed) ? owed : 0,
        refundedRappen: Number.isFinite(refunded) ? refunded : 0,
      };
    });
    if (!payload) return NextResponse.json({ ok: false }, { status: 404, headers: noStore });

    // 261002: the cancel window, from the same definer function the cancel itself uses (EXECUTE: vamos_system).
    // Read outside the customer transaction above (postgres.js begin() throws again an error caught inside it).
    // A booking that cannot be cancelled needs no window; a window that cannot be read means no Cancel button
    // rather than a promise the cancel might not keep.
    let cancelWindow: "auto_full" | "pending_ops" | "none" = "none";
    const cancellable =
      Boolean(payload.bookingId) && !UNPAID.includes(payload.status) && customerCanCancel(payload.status, payload.reviewSubmitted);
    if (cancellable) {
      try {
        const mode = await asSystem(env, async (sql) => {
          const rows = await sql<{ refund_mode: string | null }[]>`
            select refund_mode from public.compute_cancellation_refund(${payload.bookingId}::uuid)
          `;
          return rows[0]?.refund_mode ?? null;
        });
        if (mode === "auto_full" || mode === "pending_ops") cancelWindow = mode;
      } catch {
        cancelWindow = "none";
      }
    }
    return NextResponse.json(
      {
        ok: true,
        ...manageExtrasFromJson(payload.extras),
        refundStatus: payload.refundStatus,
        refundOwedRappen: payload.refundOwedRappen,
        refundedRappen: payload.refundedRappen,
        status: payload.status,
        canCancel: cancelWindow !== "none",
        cancelWindow,
        reviewSubmitted: payload.reviewSubmitted,
      },
      { headers: noStore },
    );
  } catch {
    return NextResponse.json({ ok: false }, { status: 500, headers: noStore });
  }
}
