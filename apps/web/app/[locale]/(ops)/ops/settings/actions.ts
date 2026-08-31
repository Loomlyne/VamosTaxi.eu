"use server";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { revalidatePath } from "next/cache";
import { asStaff } from "@/lib/db/identity";
import {
  assertSettingsInput,
  mapSqlState,
  SettingsInputError,
  type SettingsInput,
} from "@/lib/ops/settings";
import { requireStaffClaims } from "@/lib/ops/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type UpdateSettingsResult =
  | { ok: true }
  | { ok: false; field?: string; copyId: string };

const PUBLIC_ROUTES = ["/", "/contact", "/about", "/ops/settings"] as const;
const LOCALES = ["en", "de", "fr", "ar"] as const;

function revalidatePublished(): void {
  for (const route of PUBLIC_ROUTES) {
    revalidatePath(route);
    for (const locale of LOCALES) {
      revalidatePath(`/${locale}${route === "/" ? "" : route}`);
    }
  }
}

export async function updateSettings(input: SettingsInput): Promise<UpdateSettingsResult> {
  const supabase = await createServerSupabaseClient();
  const claims = await requireStaffClaims(supabase);

  let parsed: SettingsInput;
  try {
    parsed = assertSettingsInput(input);
  } catch (err) {
    if (err instanceof SettingsInputError) {
      return { ok: false, field: err.field, copyId: err.copyId };
    }
    throw err;
  }

  const { env } = getCloudflareContext();
  try {
    await asStaff(env, claims, async (sql) => {
      await sql`
        update public.settings set
          company = ${parsed.company},
          address = ${parsed.address},
          uid_number = ${parsed.uid_number},
          phone = ${parsed.phone},
          email = ${parsed.email},
          default_lang = ${parsed.default_lang},
          default_currency = ${parsed.default_currency},
          accepts_cash = ${parsed.accepts_cash},
          accepts_card = ${parsed.accepts_card},
          accepts_twint = ${parsed.accepts_twint},
          accepts_invoice = ${parsed.accepts_invoice},
          email_confirmation = ${parsed.email_confirmation},
          email_reminder = ${parsed.email_reminder},
          sms_reminder = ${parsed.sms_reminder},
          ops_alerts = ${parsed.ops_alerts},
          chauffeur_turnaround_minutes = ${parsed.chauffeur_turnaround_minutes},
          updated_at = now()
        where id = 1
      `;
      return null;
    });
  } catch (err) {
    const mapped = mapSqlState(err);
    if (mapped.kind === "unknown") throw err;
    return { ok: false, copyId: mapped.copyId };
  }

  revalidatePublished();
  return { ok: true };
}
