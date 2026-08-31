"use server";

import { revalidatePath } from "next/cache";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asStaff } from "@/lib/db/identity";
import {
  assertContentStringInput,
  ContentStringInputError,
} from "@/lib/ops/content";
import { requireStaffClaims, type StaffAuthClient } from "@/lib/ops/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Library-style server-action module — D-06's fence greps asStaff importers
// for this export. Meaningless on a non-route file; required so the fence
// does not treat this write path as a cacheable import.
export const dynamic = "force-dynamic";

export type ContentActionResult = { ok: true } | { ok: false; key: string };

export type ContentLanguageValues = {
  en: string;
  de: string | null;
  fr: string | null;
  ar: string | null;
};

export type ContentFlagValues = {
  pendingValue: boolean;
  nonTranslatable: boolean;
  noParamReason: string | null;
};

function mapWriteError(err: unknown): ContentActionResult {
  if (err instanceof ContentStringInputError) return { ok: false, key: err.key };
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  if (code === "23505") return { ok: false, key: "content-error-conflict" };
  if (code === "23514") return { ok: false, key: "content-error-check" };
  return { ok: false, key: "content-error-unknown" };
}

async function staffDoor() {
  const supabase = await createServerSupabaseClient();
  const claims = await requireStaffClaims(supabase as StaffAuthClient);
  const { env } = getCloudflareContext();
  return { env, claims };
}

function revalidateContentRoutes() {
  revalidatePath("/ops/content");
  revalidatePath("/ops/content/legal");
}

export async function updateContentString(
  key: string,
  values: ContentLanguageValues,
): Promise<ContentActionResult> {
  const { env, claims } = await staffDoor();
  try {
    await asStaff(env, claims, async (sql) => {
      const existing = await sql<
        {
          pending_value: boolean;
          non_translatable: boolean;
          no_param_reason: string | null;
        }[]
      >`
        select pending_value, non_translatable, no_param_reason
          from public.content_strings
         where key = ${key}
         limit 1
      `;
      const row = existing[0];
      if (!row) throw new ContentStringInputError("content-error-unknown");
      const input = assertContentStringInput({
        en: values.en,
        de: values.de,
        fr: values.fr,
        ar: values.ar,
        pendingValue: row.pending_value,
        nonTranslatable: row.non_translatable,
        noParamReason: row.no_param_reason,
      });
      await sql`
        update public.content_strings
           set en = ${input.en},
               de = ${input.de},
               fr = ${input.fr},
               ar = ${input.ar},
               updated_at = now(),
               updated_by = app.uid()
         where key = ${key}
      `;
      return true;
    });
    revalidateContentRoutes();
    return { ok: true };
  } catch (err) {
    return mapWriteError(err);
  }
}

export async function setContentStringFlags(
  key: string,
  flags: ContentFlagValues,
): Promise<ContentActionResult> {
  const { env, claims } = await staffDoor();
  try {
    await asStaff(env, claims, async (sql) => {
      const existing = await sql<
        {
          en: string;
          de: string | null;
          fr: string | null;
          ar: string | null;
        }[]
      >`
        select en, de, fr, ar
          from public.content_strings
         where key = ${key}
         limit 1
      `;
      const row = existing[0];
      if (!row) throw new ContentStringInputError("content-error-unknown");
      const input = assertContentStringInput({
        en: row.en,
        de: row.de,
        fr: row.fr,
        ar: row.ar,
        pendingValue: flags.pendingValue,
        nonTranslatable: flags.nonTranslatable,
        noParamReason: flags.noParamReason,
      });
      await sql`
        update public.content_strings
           set pending_value = ${input.pendingValue},
               non_translatable = ${input.nonTranslatable},
               no_param_reason = ${input.noParamReason},
               updated_at = now(),
               updated_by = app.uid()
         where key = ${key}
      `;
      return true;
    });
    revalidateContentRoutes();
    return { ok: true };
  } catch (err) {
    return mapWriteError(err);
  }
}
