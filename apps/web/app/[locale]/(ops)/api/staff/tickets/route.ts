// apps/web/app/[locale]/(ops)/api/staff/tickets/route.ts
//
// GET /api/staff/tickets — contact_submissions as Support tickets.
// Dual-mounted at app/api/staff/tickets. Read-only. No fixture rows.
// Phase 32: `?lang=en|de|fr|ar` (his dashboard language; anything else is en) picks the language of the
// customer-message translations in the answer.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { loadTickets } from "@/lib/ops/tickets";
import { jsonOk, withStaff } from "@/lib/ops/staff-json";
import { isLang } from "@/lib/translate/model";

export const dynamic = "force-dynamic";

export const GET = withStaff(async (claims, request) => {
  const { env } = getCloudflareContext();
  const asked = new URL(request.url).searchParams.get("lang");
  const rows = await loadTickets(env, claims, isLang(asked) ? asked : "en");
  return jsonOk(rows);
});
