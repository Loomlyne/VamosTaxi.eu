// apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route.ts
//
// POST /api/staff/rate-versions/:id/publish — withAdmin, SQLSTATE only (D-13).
// Envelope { ok:false, code:"incomplete"|"not-draft"|…, gaps? }. No err.message.
// D-01/D-02: this asStaff tx is the only public_chf flip. D-03: after success
// the console shows this live version — do not clone a new draft here.
// Next Save starts a new draft (resolveWritableVersionId). D-08: 409 keeps draft.
// settings_versions is append-only: Publish INSERTs a clone (lock + polygon),
// it never UPDATE/DELETEs that table.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asStaff } from "@/lib/db/identity";
import { loadCompleteness, type CompletenessGap } from "@/lib/ops/pricing";
import { notifyPriceChangedForUnpaid } from "@/lib/checkout/lock-mail";
import { removeUnusedClassPhotos } from "@/lib/ops/class-photo-sweep";
import { classifyPricingFailure } from "@/lib/ops/rate-book";
import { jsonErr, jsonOk, withAdmin } from "@/lib/ops/staff-json";
import { QUOTE_LOCK_MINUTES } from "@/lib/quote/lock";

export const dynamic = "force-dynamic";

function codeOf(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null || !("code" in err)) return undefined;
  const code = (err as { code: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function jsonFail(code: string, status: number, gaps: CompletenessGap[]): Response {
  return jsonErr(code, status, { gaps });
}

function publishCode(
  sql: string | undefined,
  classified: ReturnType<typeof classifyPricingFailure>,
  gaps: CompletenessGap[],
): string {
  if (classified.kind === "frozen") return "not-draft";
  if (gaps.length > 0) return "incomplete";
  if (classified.kind === "check" || sql === "P0001" || sql === "23514") return "incomplete";
  if (classified.kind === "duplicate") return "duplicate";
  if (classified.kind === "forbidden") return "forbidden";
  if (classified.kind === "fk") return "fk";
  return "unknown";
}

function asNullableInt(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

type PublishVersionRow = {
  id: number | string;
  label: string;
  status: string;
  vat_rate_bps: number | string | null;
  quote_lock_minutes: number | string | null;
  service_area_geojson: unknown;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: raw } = await context.params;
  return withAdmin(async (claims) => {
    const id = Number(raw);
    if (!Number.isInteger(id) || id < 1) return jsonErr("not-found", 404);
    const { env } = getCloudflareContext();
    const gaps = await loadCompleteness(env, claims, id);
    if (gaps.length > 0) {
      return jsonFail("incomplete", 409, gaps);
    }
    try {
      await asStaff(env, claims, async (tx) => {
        const locked = await tx<PublishVersionRow[]>`
          select id, label, status, vat_rate_bps, quote_lock_minutes, service_area_geojson
            from public.rate_versions
           where id = ${id}
           for update
        `;
        const row = locked[0];
        if (!row || row.status !== "draft") {
          const err = new Error("not-draft") as Error & { code: string };
          err.code = "23001";
          throw err;
        }
        const vatBps = asNullableInt(row.vat_rate_bps);
        const lockMinutes = QUOTE_LOCK_MINUTES;
        const serviceAreaJson =
          row.service_area_geojson == null ? null : JSON.stringify(row.service_area_geojson);
        await tx`
          update public.rate_versions
             set status = 'retired'
           where status = 'live' and id <> ${id}
        `;
        await tx`
          update public.rate_versions
             set status = 'live',
                 published_at = now(),
                 published_by = ${claims.sub},
                 quote_lock_minutes = ${QUOTE_LOCK_MINUTES}
           where id = ${id} and status = 'draft'
        `;
        await tx`
          update public.settings
             set public_chf = true,
                 vat_rate_bps = coalesce(${vatBps}, vat_rate_bps)
           where id = 1
        `;
        // settings_versions is append-only (select+insert). UPDATE is 42501.
        const publishSlug = `fare-publish-${id}`;
        await tx`
          insert into public.settings_versions (
            slug, label, created_by, effective_from,
            free_cancel_hours, modification_deadline_hours, min_advance_minutes,
            airport_waiting_minutes, city_waiting_minutes, manage_link_validity_days,
            round_trip_discount_percent, night_window_start, night_window_end, night_window_tz,
            quote_lock_minutes, checkout_window_minutes, cancellation_tiers,
            policy_doc_slug, policy_doc_version, service_area_geojson
          )
          select
            ${publishSlug},
            coalesce(nullif(${row.label}, ''), sv.label),
            ${claims.sub},
            now(),
            sv.free_cancel_hours,
            sv.modification_deadline_hours,
            sv.min_advance_minutes,
            sv.airport_waiting_minutes,
            sv.city_waiting_minutes,
            sv.manage_link_validity_days,
            sv.round_trip_discount_percent,
            sv.night_window_start,
            sv.night_window_end,
            sv.night_window_tz,
            coalesce(${lockMinutes}, sv.quote_lock_minutes),
            sv.checkout_window_minutes,
            sv.cancellation_tiers,
            sv.policy_doc_slug,
            sv.policy_doc_version,
            coalesce(${serviceAreaJson}::jsonb, sv.service_area_geojson)
          from public.settings_versions as sv
          where sv.id = (
            select sv2.id from public.settings_versions as sv2
             where sv2.effective_from <= now()
             order by sv2.effective_from desc, sv2.id desc
             limit 1
          )
            and not exists (
              select 1 from public.settings_versions as existing
               where existing.slug = ${publishSlug}
            )
        `;
        return null;
      });
    } catch (err) {
      const sql = codeOf(err);
      const classified = classifyPricingFailure(err);
      const named =
        classified.kind === "frozen" ||
        classified.kind === "check" ||
        sql === "P0001" ||
        sql === "23514"
          ? await loadCompleteness(env, claims, id)
          : [];
      const code = publishCode(sql, classified, named);
      const status = code === "forbidden" ? 403 : 409;
      return jsonFail(code, status, named);
    }
    try {
      await notifyPriceChangedForUnpaid(env);
    } catch {
      // Skip-send is best-effort. The book is already live.
    }
    // Quick 260930-cpr: replaced class photos leave storage once the book is published. Never throws.
    await removeUnusedClassPhotos(env, claims, "publish");
    return jsonOk({ id, status: "live" });
  })(request);
}
