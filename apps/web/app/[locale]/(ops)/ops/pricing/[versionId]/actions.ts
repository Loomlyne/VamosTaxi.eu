"use server";

// dynamic = "force-dynamic" — D-06 fence. A real export is illegal in a "use server" module.

import { revalidatePath } from "next/cache";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asStaff } from "@/lib/db/identity";
import {
  assertDistanceRateInput,
  assertFixedRouteInput,
  assertSurchargeInput,
  classifyPricingFailure,
  RateBookInputError,
  type DistanceRateInput,
  type FixedRouteInput,
  type SurchargeInput,
} from "@/lib/ops/rate-book";
import { OpsAuthError, requireAdminClaims, type StaffAuthClient } from "@/lib/ops/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type RateBookActionResult = { ok: true } | { ok: false; key: string };

const PRICING_PATH = "/ops/pricing";

function versionPath(versionId: number): string {
  return `${PRICING_PATH}/${versionId}`;
}

function revalidate(versionId: number): void {
  revalidatePath(PRICING_PATH);
  revalidatePath(versionPath(versionId));
}

function fail(err: unknown): RateBookActionResult {
  if (err instanceof RateBookInputError) return { ok: false, key: `pricing.${err.key}` };
  if (err instanceof OpsAuthError) return { ok: false, key: "pricing.rateBook.failure-forbidden" };
  const classified = classifyPricingFailure(err);
  switch (classified.kind) {
    case "frozen":
      return { ok: false, key: "pricing.rateBook.failure-frozen" };
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

function isVersionId(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export async function upsertDistanceRate(
  versionId: number,
  id: number | null,
  input: DistanceRateInput,
): Promise<RateBookActionResult> {
  try {
    if (!isVersionId(versionId)) return { ok: false, key: "pricing.rateBook.failure-unknown" };
    const parsed = assertDistanceRateInput(input);
    const supabase = (await createServerSupabaseClient()) as StaffAuthClient;
    const claims = await requireAdminClaims(supabase);
    const { env } = getCloudflareContext();
    await asStaff(env, claims, async (tx) => {
      if (id != null) {
        await tx`
          update public.distance_rates set
            vehicle_class_id = ${parsed.vehicleClassId},
            base_fare_rappen = ${parsed.baseFareRappen},
            per_km_rappen = ${parsed.perKmRappen},
            min_fare_rappen = ${parsed.minFareRappen},
            airport_start_rappen = ${parsed.airportStartRappen},
            city_price_rappen = ${parsed.cityPriceRappen},
            max_pax = ${parsed.maxPax},
            available = ${parsed.available},
            hide_from_public = ${parsed.hideFromPublic}
          where id = ${id} and rate_version_id = ${versionId}
        `;
      } else {
        await tx`
          insert into public.distance_rates (
            rate_version_id, vehicle_class_id, base_fare_rappen, per_km_rappen,
            min_fare_rappen, airport_start_rappen, city_price_rappen,
            max_pax, available, hide_from_public
          ) values (
            ${versionId}, ${parsed.vehicleClassId}, ${parsed.baseFareRappen},
            ${parsed.perKmRappen}, ${parsed.minFareRappen},
            ${parsed.airportStartRappen}, ${parsed.cityPriceRappen},
            ${parsed.maxPax}, ${parsed.available}, ${parsed.hideFromPublic}
          )
        `;
      }
      return null;
    });
    revalidate(versionId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteDistanceRate(
  versionId: number,
  id: number,
): Promise<RateBookActionResult> {
  try {
    if (!isVersionId(versionId) || !Number.isInteger(id) || id < 1) {
      return { ok: false, key: "pricing.rateBook.failure-unknown" };
    }
    const supabase = (await createServerSupabaseClient()) as StaffAuthClient;
    const claims = await requireAdminClaims(supabase);
    const { env } = getCloudflareContext();
    await asStaff(env, claims, async (tx) => {
      await tx`
        delete from public.distance_rates
         where id = ${id} and rate_version_id = ${versionId}
      `;
      return null;
    });
    revalidate(versionId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setDistanceRateAvailable(
  versionId: number,
  id: number,
  available: boolean,
): Promise<RateBookActionResult> {
  try {
    if (!isVersionId(versionId) || !Number.isInteger(id) || id < 1) {
      return { ok: false, key: "pricing.rateBook.failure-unknown" };
    }
    const supabase = (await createServerSupabaseClient()) as StaffAuthClient;
    const claims = await requireAdminClaims(supabase);
    const { env } = getCloudflareContext();
    await asStaff(env, claims, async (tx) => {
      await tx`
        update public.distance_rates
           set available = ${available}
         where id = ${id} and rate_version_id = ${versionId}
      `;
      return null;
    });
    revalidate(versionId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function upsertFixedRoute(
  versionId: number,
  id: number | null,
  input: FixedRouteInput,
): Promise<RateBookActionResult> {
  try {
    if (!isVersionId(versionId)) return { ok: false, key: "pricing.rateBook.failure-unknown" };
    const parsed = assertFixedRouteInput(input);
    const supabase = (await createServerSupabaseClient()) as StaffAuthClient;
    const claims = await requireAdminClaims(supabase);
    const { env } = getCloudflareContext();
    await asStaff(env, claims, async (tx) => {
      if (id != null) {
        await tx`
          update public.fixed_routes set
            origin_zone_id = ${parsed.originZoneId},
            dest_zone_id = ${parsed.destZoneId},
            vehicle_class_id = ${parsed.vehicleClassId},
            price_rappen = ${parsed.priceRappen},
            live = ${parsed.live}
          where id = ${id} and rate_version_id = ${versionId}
        `;
      } else {
        await tx`
          insert into public.fixed_routes (
            rate_version_id, origin_zone_id, dest_zone_id, vehicle_class_id, price_rappen, live
          ) values (
            ${versionId}, ${parsed.originZoneId}, ${parsed.destZoneId},
            ${parsed.vehicleClassId}, ${parsed.priceRappen}, ${parsed.live}
          )
        `;
      }
      return null;
    });
    revalidate(versionId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteFixedRoute(
  versionId: number,
  id: number,
): Promise<RateBookActionResult> {
  try {
    if (!isVersionId(versionId) || !Number.isInteger(id) || id < 1) {
      return { ok: false, key: "pricing.rateBook.failure-unknown" };
    }
    const supabase = (await createServerSupabaseClient()) as StaffAuthClient;
    const claims = await requireAdminClaims(supabase);
    const { env } = getCloudflareContext();
    await asStaff(env, claims, async (tx) => {
      await tx`
        delete from public.fixed_routes
         where id = ${id} and rate_version_id = ${versionId}
      `;
      return null;
    });
    revalidate(versionId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setFixedRouteLive(
  versionId: number,
  id: number,
  live: boolean,
): Promise<RateBookActionResult> {
  try {
    if (!isVersionId(versionId) || !Number.isInteger(id) || id < 1) {
      return { ok: false, key: "pricing.rateBook.failure-unknown" };
    }
    const supabase = (await createServerSupabaseClient()) as StaffAuthClient;
    const claims = await requireAdminClaims(supabase);
    const { env } = getCloudflareContext();
    await asStaff(env, claims, async (tx) => {
      await tx`
        update public.fixed_routes
           set live = ${live}
         where id = ${id} and rate_version_id = ${versionId}
      `;
      return null;
    });
    revalidate(versionId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function upsertSurcharge(
  versionId: number,
  id: number | null,
  input: SurchargeInput,
): Promise<RateBookActionResult> {
  try {
    if (!isVersionId(versionId)) return { ok: false, key: "pricing.rateBook.failure-unknown" };
    const parsed = assertSurchargeInput(input);
    const supabase = (await createServerSupabaseClient()) as StaffAuthClient;
    const claims = await requireAdminClaims(supabase);
    const { env } = getCloudflareContext();
    await asStaff(env, claims, async (tx) => {
      if (id != null) {
        await tx`
          update public.surcharges set
            code = ${parsed.code},
            kind = ${parsed.kind},
            amount_rappen = ${parsed.amountRappen},
            percent = ${parsed.percent},
            applies_to = ${parsed.appliesTo},
            active = ${parsed.active}
          where id = ${id} and rate_version_id = ${versionId}
        `;
      } else {
        await tx`
          insert into public.surcharges (
            rate_version_id, code, kind, amount_rappen, percent, applies_to, active
          ) values (
            ${versionId}, ${parsed.code}, ${parsed.kind}, ${parsed.amountRappen},
            ${parsed.percent}, ${parsed.appliesTo}, ${parsed.active}
          )
        `;
      }
      return null;
    });
    revalidate(versionId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteSurcharge(
  versionId: number,
  id: number,
): Promise<RateBookActionResult> {
  try {
    if (!isVersionId(versionId) || !Number.isInteger(id) || id < 1) {
      return { ok: false, key: "pricing.rateBook.failure-unknown" };
    }
    const supabase = (await createServerSupabaseClient()) as StaffAuthClient;
    const claims = await requireAdminClaims(supabase);
    const { env } = getCloudflareContext();
    await asStaff(env, claims, async (tx) => {
      await tx`
        delete from public.surcharges
         where id = ${id} and rate_version_id = ${versionId}
      `;
      return null;
    });
    revalidate(versionId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setSurchargeActive(
  versionId: number,
  id: number,
  active: boolean,
): Promise<RateBookActionResult> {
  try {
    if (!isVersionId(versionId) || !Number.isInteger(id) || id < 1) {
      return { ok: false, key: "pricing.rateBook.failure-unknown" };
    }
    const supabase = (await createServerSupabaseClient()) as StaffAuthClient;
    const claims = await requireAdminClaims(supabase);
    const { env } = getCloudflareContext();
    await asStaff(env, claims, async (tx) => {
      await tx`
        update public.surcharges
           set active = ${active}
         where id = ${id} and rate_version_id = ${versionId}
      `;
      return null;
    });
    revalidate(versionId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
