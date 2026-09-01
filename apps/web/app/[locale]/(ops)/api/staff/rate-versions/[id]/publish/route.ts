// apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route.ts
//
// POST /api/staff/rate-versions/:id/publish — withAdmin, SQLSTATE only (D-13).
// Envelope { ok:false, code:"incomplete"|"not-draft"|…, gaps? }. No err.message.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asStaff } from "@/lib/db/identity";
import { loadCompleteness, type CompletenessGap } from "@/lib/ops/pricing";
import { classifyPricingFailure } from "@/lib/ops/rate-book";
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
  if (gaps.length > 0) return "incomplete";
  if (classified.kind === "frozen") return "not-draft";
  if (classified.kind === "check" || sql === "P0001" || sql === "23514") return "incomplete";
  if (classified.kind === "duplicate") return "duplicate";
  if (classified.kind === "forbidden") return "forbidden";
  if (classified.kind === "fk") return "fk";
  return "unknown";
}

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
        await tx`update public.rate_versions set status = 'live' where id = ${id}`;
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
    return jsonOk({ id, status: "live" });
  })(request);
}
