"use server";

// dynamic = "force-dynamic" — D-06 fence. A real export is illegal in a "use server" module.

import { revalidatePath } from "next/cache";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asStaff } from "@/lib/db/identity";
import {
  assertServiceZoneInput,
  classifyPricingFailure,
  RateBookInputError,
  type ServiceZoneInput,
} from "@/lib/ops/rate-book";
import { OpsAuthError, requireStaffClaims, type StaffAuthClient } from "@/lib/ops/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ZoneActionResult = { ok: true } | { ok: false; key: string };

const ZONES_PATH = "/ops/pricing/zones";
const PRICING_PATH = "/ops/pricing";

function revalidate(): void {
  revalidatePath(ZONES_PATH);
  revalidatePath(PRICING_PATH);
}

function fail(err: unknown): ZoneActionResult {
  if (err instanceof RateBookInputError) return { ok: false, key: `pricing.${err.key}` };
  if (err instanceof OpsAuthError) return { ok: false, key: "pricing.rateBook.failure-forbidden" };
  const classified = classifyPricingFailure(err);
  switch (classified.kind) {
    case "duplicate":
      return { ok: false, key: "pricing.rateBook.failure-duplicate" };
    case "check":
      return { ok: false, key: "pricing.rateBook.failure-check" };
    case "forbidden":
      return { ok: false, key: "pricing.rateBook.failure-forbidden" };
    case "fk":
      return { ok: false, key: "pricing.rateBook.failure-fk" };
    default:
      return { ok: false, key: "pricing.rateBook.failure-unknown" };
  }
}

export async function upsertServiceZone(
  id: string | null,
  input: ServiceZoneInput,
): Promise<ZoneActionResult> {
  try {
    const parsed = assertServiceZoneInput(input);
    const supabase = (await createServerSupabaseClient()) as StaffAuthClient;
    const claims = await requireStaffClaims(supabase);
    const { env } = getCloudflareContext();
    await asStaff(env, claims, async (tx) => {
      if (id) {
        await tx`
          update public.service_zones set
            slug = ${parsed.slug},
            iata = ${parsed.iata},
            active = ${parsed.active}
          where id = ${id}
        `;
      } else {
        await tx`
          insert into public.service_zones (slug, iata, active)
          values (${parsed.slug}, ${parsed.iata}, ${parsed.active})
        `;
      }
      return null;
    });
    revalidate();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteServiceZone(id: string): Promise<ZoneActionResult> {
  try {
    const supabase = (await createServerSupabaseClient()) as StaffAuthClient;
    const claims = await requireStaffClaims(supabase);
    const { env } = getCloudflareContext();
    await asStaff(env, claims, async (tx) => {
      await tx`delete from public.service_zones where id = ${id}`;
      return null;
    });
    revalidate();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setServiceZoneActive(
  id: string,
  active: boolean,
): Promise<ZoneActionResult> {
  try {
    const supabase = (await createServerSupabaseClient()) as StaffAuthClient;
    const claims = await requireStaffClaims(supabase);
    const { env } = getCloudflareContext();
    await asStaff(env, claims, async (tx) => {
      await tx`update public.service_zones set active = ${active} where id = ${id}`;
      return null;
    });
    revalidate();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
