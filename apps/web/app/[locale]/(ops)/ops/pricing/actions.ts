"use server";

// dynamic = "force-dynamic" — D-06 fence. A real export is illegal in a "use server" module.

import { revalidatePath } from "next/cache";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asStaff } from "@/lib/db/identity";
import {
  loadCompleteness,
  type CompletenessGap,
} from "@/lib/ops/pricing";
import { requireAdminClaims, type StaffAuthClient } from "@/lib/ops/session";
import { mapSqlState, type OpsDbFailure } from "@/lib/ops/sqlstate";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type PublishRateVersionResult =
  | { ok: true }
  | { ok: false; failure: OpsDbFailure; gaps: CompletenessGap[] };

export type CreateDraftVersionResult =
  | { ok: true }
  | { ok: false; failure: OpsDbFailure };

const PRICING_PATH = "/ops/pricing";

async function adminContext() {
  const supabase = (await createServerSupabaseClient()) as StaffAuthClient;
  const claims = await requireAdminClaims(supabase);
  const { env } = getCloudflareContext();
  return { env, claims };
}

export async function publishRateVersion(id: number): Promise<PublishRateVersionResult> {
  const { env, claims } = await adminContext();
  const gaps = await loadCompleteness(env, claims, id);
  if (gaps.length > 0) {
    return { ok: false, failure: mapSqlState({ code: "23001" }), gaps };
  }
  try {
    await asStaff(env, claims, async (tx) => {
      await tx`update public.rate_versions set status = 'live' where id = ${id}`;
    });
  } catch (err) {
    const failure = mapSqlState(err);
    const named =
      failure.kind === "restrict" ? await loadCompleteness(env, claims, id) : [];
    return { ok: false, failure, gaps: named };
  }
  revalidatePath(PRICING_PATH);
  return { ok: true };
}

export async function createDraftVersion(
  slug: string,
  label: string,
  note: string | null,
): Promise<CreateDraftVersionResult> {
  const { env, claims } = await adminContext();
  try {
    await asStaff(env, claims, async (tx) => {
      await tx`
        insert into public.rate_versions (slug, label, note)
        values (${slug}, ${label}, ${note})
      `;
    });
  } catch (err) {
    return { ok: false, failure: mapSqlState(err) };
  }
  revalidatePath(PRICING_PATH);
  return { ok: true };
}
