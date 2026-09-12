// apps/web/app/api/reviews/submit/route.ts
//
// POST /api/reviews/submit → submit_review (guest) or submit_review_customer.
// D-18/D-19/D-21. Turnstile reused from contact.

export const dynamic = "force-dynamic";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { customerClaims } from "@/lib/account/session";
import { hashManageToken } from "@/lib/checkout/manage-token";
import { asCustomer, asGuest, asSystem } from "@/lib/db/identity";
import { isReadablePhotoKey } from "@/lib/ops/photos";
import { verifyTurnstile } from "@/lib/turnstile";

const BOOKING_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BOOKING_REF = /^VT-\d{2}-\d{4,5}$/i;

type SubmitRow = { review_id: string; booking_id: string };

function jsonErr(code: string, status: number): Response {
  return Response.json({ ok: false, code }, { status });
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

function mapReviewSqlError(err: unknown): Response {
  const message = messageOf(err);
  const sql = sqlCodeOf(err);
  if (message === "not_found" || message === "not-found" || sql === "P0002") {
    return jsonErr("not-found", 404);
  }
  if (message.startsWith("not_reviewable") || message.startsWith("not-reviewable")) {
    return jsonErr("not-reviewable", 403);
  }
  if (message.startsWith("already_reviewed") || message.startsWith("already-reviewed")) {
    return jsonErr("already-reviewed", 409);
  }
  if (message.startsWith("invalid_rating") || message.startsWith("invalid-rating")) {
    return jsonErr("invalid-rating", 400);
  }
  return jsonErr("unknown", 500);
}

function star(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 5) return null;
  return n;
}

function photoPathOf(value: unknown): string | null | undefined {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const key = value.trim();
  if (!key.startsWith("reviews/") || !isReadablePhotoKey(key)) return undefined;
  return key;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request): Promise<Response> {
  const { env } = await getCloudflareContext({ async: true });
  const bindings = env as unknown as Record<string, string | undefined>;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonErr("invalid-input", 400);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return jsonErr("invalid-input", 400);
  }
  const body = raw as Record<string, unknown>;

  const turnstileToken = str(body.turnstileToken);
  const idempotencyKey = str(body.idempotencyKey);
  const challenge = await verifyTurnstile(
    env.TURNSTILE_SECRET_KEY ?? process.env.TURNSTILE_SECRET_KEY,
    turnstileToken,
    {
      action: "contact",
      idempotencyKey,
      allowedHostnames:
        bindings.CONTACT_TURNSTILE_ALLOWED_HOSTNAMES ??
        process.env.CONTACT_TURNSTILE_ALLOWED_HOSTNAMES,
      remoteip: request.headers.get("cf-connecting-ip") ?? undefined,
    },
  );
  if (!challenge.ok) return jsonErr("challenge_failed", 403);

  const company = star(body.company);
  const chauffeur = star(body.chauffeur);
  const overall = star(body.overall);
  if (company == null || chauffeur == null || overall == null) {
    return jsonErr("invalid-rating", 400);
  }

  const comment = str(body.comment);
  const photoPath = photoPathOf(body.photoKey);
  if (photoPath === undefined) return jsonErr("invalid-photo", 400);

  const token = str(body.token);
  const bookingRef = str(body.bookingRef);
  const tokenHashHex = token ? await hashManageToken(token) : "";
  const claims = await customerClaims(request);

  if (tokenHashHex) {
    let row: SubmitRow | undefined;
    try {
      row = await asGuest(env, tokenHashHex, async (sql) => {
        const rows = await sql<SubmitRow[]>`
          select * from public.submit_review(
            decode(${tokenHashHex}, 'hex'),
            ${company}::smallint,
            ${chauffeur}::smallint,
            ${overall}::smallint,
            ${comment || null},
            ${photoPath}
          )
        `;
        return rows[0];
      });
    } catch (err) {
      return mapReviewSqlError(err);
    }
    if (!row?.review_id) return jsonErr("not-found", 404);
    return Response.json({
      ok: true,
      reviewId: row.review_id,
      bookingId: row.booking_id,
    });
  }

  const email = typeof claims?.email === "string" ? claims.email : "";
  if (!claims || !email) return jsonErr("unauthorized", 401);
  if (!bookingRef || (!BOOKING_UUID.test(bookingRef) && !BOOKING_REF.test(bookingRef))) {
    return jsonErr("not-found", 404);
  }

  let bookingId: string | undefined;
  try {
    bookingId = await asCustomer(env, claims, async (sql) => {
      const rows = await sql<{ id: string }[]>`
        select b.id
          from public.bookings as b
         where b.erased_at is null
           and lower(b.contact_email::text) = lower(${email})
           and (b.id::text = ${bookingRef} or b.reference = ${bookingRef})
         limit 1
      `;
      return rows[0]?.id;
    });
  } catch (err) {
    return mapReviewSqlError(err);
  }
  if (!bookingId) return jsonErr("not-found", 404);

  let row: SubmitRow | undefined;
  try {
    row = await asSystem(env, async (sql) => {
      const rows = await sql<SubmitRow[]>`
        select * from public.submit_review_customer(
          ${bookingId}::uuid,
          ${company}::smallint,
          ${chauffeur}::smallint,
          ${overall}::smallint,
          ${comment || null},
          ${photoPath}
        )
      `;
      return rows[0];
    });
  } catch (err) {
    return mapReviewSqlError(err);
  }
  if (!row?.review_id) return jsonErr("not-found", 404);
  return Response.json({
    ok: true,
    reviewId: row.review_id,
    bookingId: row.booking_id,
  });
}
