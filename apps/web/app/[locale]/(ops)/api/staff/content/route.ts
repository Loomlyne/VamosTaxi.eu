// apps/web/app/[locale]/(ops)/api/staff/content/route.ts
//
// GET /api/staff/content — namespaces + paged keys + legal coverage.
// Dual-mounted at app/api/staff/content so the DC mock can hit the absolute
// path despite <base href="/app/ops/">. Reads go through asStaff (D-02).
// loadRawMessages is unchanged (D-17 / 06-11).

import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  loadContentStrings,
  loadLegalCoverage,
  loadNamespaces,
  parseContentFilter,
} from "@/lib/ops/content";
import { jsonOk, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

function parseCount(raw: string | null, fallback: number): number {
  if (raw == null || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const GET = withStaff(async (claims, request) => {
  const { env } = getCloudflareContext();
  const url = new URL(request.url);
  const namespace = url.searchParams.get("namespace")?.trim() || undefined;
  const search = url.searchParams.get("search")?.trim() || undefined;
  const filter = parseContentFilter(url.searchParams.get("filter"));
  const limit = parseCount(url.searchParams.get("limit"), 50);
  const offset = parseCount(url.searchParams.get("offset"), 0);
  const legalOnly =
    url.searchParams.get("legalCoverage") === "1" ||
    url.searchParams.get("view") === "legal-coverage";

  const [namespaces, coverage, list] = await Promise.all([
    loadNamespaces(env, claims),
    loadLegalCoverage(env, claims),
    legalOnly
      ? Promise.resolve({ rows: [], total: 0 })
      : loadContentStrings(env, claims, { namespace, search, filter, limit, offset }),
  ]);

  return jsonOk({
    namespaces,
    rows: list.rows,
    total: list.total,
    coverage,
    filter,
    namespace: namespace ?? null,
    limit,
    offset,
  });
});
