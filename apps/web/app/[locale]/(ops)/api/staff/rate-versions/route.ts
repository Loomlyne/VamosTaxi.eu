// apps/web/app/[locale]/(ops)/api/staff/rate-versions/route.ts
//
// GET  /api/staff/rate-versions — staff read (RLS may return []).
// POST /api/staff/rate-versions — admin createDraft.
// Dual-mounted at app/api/staff/rate-versions. No postgres import. No CHF.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asStaff } from "@/lib/db/identity";
import { loadRateVersions } from "@/lib/ops/pricing";
import { mapSqlState } from "@/lib/ops/sqlstate";
import { jsonErr, jsonOk, withAdmin, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

function codeOf(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null || !("code" in err)) return undefined;
  const code = (err as { code: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

export const GET = withStaff(async (claims) => {
  const { env } = getCloudflareContext();
  const versions = await loadRateVersions(env, claims);
  return jsonOk({ versions });
});

export const POST = withAdmin(async (claims, request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonErr("invalid", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonErr("invalid", 400);
  }
  const rec = body as Record<string, unknown>;
  const slug = typeof rec.slug === "string" ? rec.slug.trim() : "";
  const label = typeof rec.label === "string" ? rec.label.trim() : "";
  const note =
    rec.note == null ? null : typeof rec.note === "string" ? rec.note : null;
  if (!slug || !label) return jsonErr("invalid", 400);

  const { env } = getCloudflareContext();
  try {
    await asStaff(env, claims, async (tx) => {
      await tx`
        insert into public.rate_versions (slug, label, note)
        values (${slug}, ${label}, ${note})
      `;
      return null;
    });
  } catch (err) {
    const mapped = mapSqlState(err);
    const sql = codeOf(err);
    if (mapped.kind === "unique") return jsonErr("duplicate", 409);
    if (mapped.kind === "privilege") return jsonErr("forbidden", 403);
    if (mapped.kind === "restrict" || sql === "P0001") return jsonErr("not-draft", 409);
    return jsonErr("unknown", 500);
  }
  const versions = await loadRateVersions(env, claims);
  return jsonOk({ versions }, 201);
});
