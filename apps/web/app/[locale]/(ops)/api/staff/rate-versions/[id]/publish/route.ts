// apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route.ts
//
// POST /api/staff/rate-versions/:id/publish — withAdmin, SQLSTATE only (D-13).
// Envelope { ok:false, code:"incomplete"|"not-draft"|…, gaps? }. No err.message.
// D-02: this asStaff tx is the only public_chf flip. D-03: VAT applies here.
// D-06: clone a new draft after success. Never flip public_chf back off.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asStaff } from "@/lib/db/identity";
import { loadCompleteness, type CompletenessGap } from "@/lib/ops/pricing";
import { notifyPriceChangedForUnpaid } from "@/lib/checkout/lock-mail";
import { classifyPricingFailure, forkLiveRateVersion } from "@/lib/ops/rate-book";
import { jsonErr, jsonOk, withAdmin } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

function codeOf(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null || !("code" in err)) return undefined;
  const code = (err as { code: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function jsonFail(code: string, status: number, gaps: CompletenessGap[]): Response {
  return Response.json({ ok: false, code, gaps }, { status });
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
        const lockMinutes = asNullableInt(row.quote_lock_minutes);
        const serviceArea = row.service_area_geojson ?? null;
        await tx`
          update public.rate_versions
             set status = 'retired'
           where status = 'live' and id <> ${id}
        `;
        await tx`
          update public.rate_versions
             set status = 'live',
                 published_at = now(),
                 published_by = ${claims.sub}
           where id = ${id} and status = 'draft'
        `;
        await tx`
          update public.settings
             set public_chf = true,
                 vat_rate_bps = coalesce(${vatBps}, vat_rate_bps)
           where id = 1
        `;
        await tx`
          update public.settings_versions
             set quote_lock_minutes = coalesce(${lockMinutes}, quote_lock_minutes),
                 service_area_geojson = coalesce(${serviceArea}, service_area_geojson)
           where id = (
             select sv.id from public.settings_versions sv
              where sv.effective_from <= now()
              order by sv.effective_from desc
              limit 1
           )
        `;
        await forkLiveRateVersion(env, claims, { id, label: row.label }, tx);
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
    return jsonOk({ id, status: "live" });
  })(request);
}
