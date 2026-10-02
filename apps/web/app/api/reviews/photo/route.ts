// apps/web/app/api/reviews/photo/route.ts
//
// Customer review photo. Live R2 PHOTOS.put under reviews/ via buildPhotoKey('review').
// Auth is hashed token or JWT — never staff-gated, never the staff upload route.

export const dynamic = "force-dynamic";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { customerClaims } from "@/lib/account/session";
import { hashManageToken } from "@/lib/checkout/manage-token";
import { asCustomer, asGuest } from "@/lib/db/identity";
import {
  PhotoUploadError,
  assertPhotoUpload,
  buildPhotoKey,
} from "@/lib/ops/photos";
import { accountWriteForbidden } from "@/lib/abuse/account-write";
import { csrfForbidden } from "@/lib/security/origin";

const BOOKING_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BOOKING_REF = /^VT-\d{2}-\d{4,5}$/i;
const BLOCKED: readonly string[] = Object.freeze(["quote", "pending", "cancelled", "partially_cancelled"]);

type BookingRow = { booking_id: string; status: string };

const noStore = { "cache-control": "private, no-store" };

function jsonErr(code: string, status: number): Response {
  return Response.json({ ok: false, code }, { status, headers: noStore });
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function messageOf(err: unknown): string {
  if (typeof err !== "object" || err === null || !("message" in err)) return "";
  const message = (err as { message: unknown }).message;
  return typeof message === "string" ? message : "";
}

function sqlCodeOf(err: unknown): string {
  if (typeof err !== "object" || err === null || !("code" in err)) return "";
  const code = (err as { code: unknown }).code;
  return typeof code === "string" ? code : "";
}

function mapLookupError(err: unknown): Response {
  const message = messageOf(err);
  const sql = sqlCodeOf(err);
  if (message === "not_found" || message === "not-found" || sql === "P0002") {
    return jsonErr("not-found", 404);
  }
  return jsonErr("unknown", 500);
}

export async function POST(request: Request): Promise<Response> {
  const blocked = csrfForbidden(request);
  if (blocked) return blocked;
  // 26.2 audit: the same write limit as every other account and manage write; each upload
  // stores a new R2 object, so an unlimited loop was storage cost with no ceiling.
  const limited = await accountWriteForbidden(request);
  if (limited) return limited;
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonErr("invalid-input", 400);
  }
  const fileRaw = formData.get("file");
  const token = str(formData.get("token"));
  const bookingRef = str(formData.get("bookingRef"));

  if (!(fileRaw instanceof File)) return jsonErr("type_not_allowed", 400);

  const bytes = new Uint8Array(await fileRaw.arrayBuffer());
  try {
    assertPhotoUpload({ type: fileRaw.type, size: fileRaw.size, bytes });
  } catch (err) {
    if (err instanceof PhotoUploadError) {
      return Response.json({ error: err.code }, { status: 400, headers: noStore });
    }
    throw err;
  }

  const { env } = await getCloudflareContext({ async: true });
  const tokenHashHex = token ? await hashManageToken(token) : "";
  const claims = await customerClaims(request);

  let booking: BookingRow | undefined;
  try {
    if (tokenHashHex) {
      booking = await asGuest(env, tokenHashHex, async (sql) => {
        const rows = await sql<BookingRow[]>`
          select booking_id, status::text as status
            from public.manage_booking_read(decode(${tokenHashHex}, 'hex'))
        `;
        return rows[0];
      });
    } else {
      const email = typeof claims?.email === "string" ? claims.email : "";
      if (!claims || !email) return jsonErr("unauthorized", 401);
      if (!bookingRef || (!BOOKING_UUID.test(bookingRef) && !BOOKING_REF.test(bookingRef))) {
        return jsonErr("not-found", 404);
      }
      booking = await asCustomer(env, claims, async (sql) => {
        const rows = await sql<BookingRow[]>`
          select b.id as booking_id, b.status::text as status
            from public.bookings as b
           where b.erased_at is null
             and lower(b.contact_email::text) = lower(${email})
             and (b.id::text = ${bookingRef} or b.reference = ${bookingRef})
           limit 1
        `;
        return rows[0];
      });
    }
  } catch (err) {
    return mapLookupError(err);
  }

  if (!booking?.booking_id) return jsonErr("not-found", 404);
  const status = booking.status.toLowerCase();
  if (BLOCKED.includes(status)) return jsonErr("not-reviewable", 403);

  const key = buildPhotoKey("review", booking.booking_id, fileRaw.type);
  await env.PHOTOS.put(key, bytes, {
    httpMetadata: { contentType: fileRaw.type },
  });

  return Response.json({ key }, { headers: noStore });
}
