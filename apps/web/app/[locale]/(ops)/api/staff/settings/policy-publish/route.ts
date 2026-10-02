// apps/web/app/[locale]/(ops)/api/staff/settings/policy-publish/route.ts
//
// POST /api/staff/settings/policy-publish — makes the drafted policy values live.
//
// Owner decision 2026-10-02: the four policy values get a draft and a Publish, the
// same two-step as the price book. See
// .planning/decisions/2026-10-02-policy-values-draft-then-publish.md
//
// Admin only, like the price-book Publish: Save is staff, going live is not.
// settings_versions stays append-only — public.policy_publish_draft INSERTs a
// superseding row and never updates one.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asStaff } from "@/lib/db/identity";
import {
  loadCurrentPolicyVersion,
  loadPolicyDraft,
  mapSqlState,
  policyDraftChanges,
} from "@/lib/ops/settings";
import { jsonErr, jsonOk, withAdmin } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

function codeOf(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

export const POST = withAdmin(async (claims) => {
  const { env } = getCloudflareContext();

  const draft = await loadPolicyDraft(env, claims);
  if (!draft) return jsonErr("settings-error-policy-no-draft", 400);

  const before = await loadCurrentPolicyVersion(env, claims);
  const changes = policyDraftChanges(draft, before);
  if (changes.length === 0) return jsonErr("settings-error-policy-unchanged", 400);

  try {
    // begin() rethrows anything caught inside it, so the catch stays out here.
    await asStaff(env, claims, async (sql) => {
      await sql`select public.policy_publish_draft(${claims.sub}::uuid)`;
      return null;
    });
  } catch (err) {
    // 22023 is the function's own refusal (empty value, or nothing to publish after a
    // racing Publish landed first); it is not a fault to show as a server error.
    if (codeOf(err) === "22023") return jsonErr("settings-error-policy-unchanged", 409);
    const mapped = mapSqlState(err);
    if (mapped.kind === "unknown") throw err;
    return jsonErr(mapped.copyId, mapped.kind === "privilege" ? 403 : 400);
  }

  const after = await loadCurrentPolicyVersion(env, claims);
  return jsonOk({
    published: true,
    changes: changes.map((c) => ({ field: c.field, from: c.from ?? "", to: c.to ?? "" })),
    liveMinAdvance: after?.min_advance_minutes ?? "",
    liveCancelWindow: after?.free_cancel_hours ?? "",
    liveAirportWait: after?.airport_waiting_minutes ?? "",
    liveCityWait: after?.city_waiting_minutes ?? "",
    policySlug: after?.slug ?? "",
    policyEffectiveFrom: after?.effective_from ?? "",
  });
});
