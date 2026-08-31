"use server";

import { revalidatePath } from "next/cache";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asStaff } from "@/lib/db/identity";
import {
  assertCouponInput,
  CouponInputError,
  mapSqlState,
  type CouponInput,
} from "@/lib/ops/coupons";
import { OpsAuthError, requireStaffClaims, type StaffAuthClient } from "@/lib/ops/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const COUPONS_PATH = "/ops/coupons";

export type CouponActionResult = { ok: true } | { ok: false; key: string };

async function staffDoor() {
  const supabase = (await createServerSupabaseClient()) as StaffAuthClient;
  const claims = await requireStaffClaims(supabase);
  const { env } = getCloudflareContext();
  return { env, claims };
}

function fail(err: unknown): CouponActionResult {
  if (err instanceof CouponInputError) return { ok: false, key: err.key };
  if (err instanceof OpsAuthError) return { ok: false, key: "coupons-error" };
  const mapped = mapSqlState(err);
  if (mapped.kind === "unique") return { ok: false, key: "coupons-duplicate" };
  if (mapped.kind === "check") return { ok: false, key: "coupons-constraint" };
  return { ok: false, key: "coupons-error" };
}

export async function createCoupon(input: CouponInput): Promise<CouponActionResult> {
  try {
    const parsed = assertCouponInput(input);
    const { env, claims } = await staffDoor();
    await asStaff(env, claims, async (sql) => {
      await sql`
        insert into public.coupons (
          code, kind, percent, amount_rappen,
          valid_from, valid_until, global_limit, per_user_limit, active, note
        ) values (
          ${parsed.code},
          ${parsed.kind},
          ${parsed.percent},
          ${parsed.amountRappen},
          ${parsed.validFrom},
          ${parsed.validUntil},
          ${parsed.globalLimit},
          ${parsed.perUserLimit},
          ${parsed.active},
          ${parsed.note}
        )
      `;
      return null;
    });
    revalidatePath(COUPONS_PATH);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function updateCoupon(id: number, input: CouponInput): Promise<CouponActionResult> {
  try {
    if (!Number.isInteger(id) || id < 1) return { ok: false, key: "coupons-error" };
    const parsed = assertCouponInput(input);
    const { env, claims } = await staffDoor();
    await asStaff(env, claims, async (sql) => {
      await sql`
        update public.coupons set
          code = ${parsed.code},
          kind = ${parsed.kind},
          percent = ${parsed.percent},
          amount_rappen = ${parsed.amountRappen},
          valid_from = ${parsed.validFrom},
          valid_until = ${parsed.validUntil},
          global_limit = ${parsed.globalLimit},
          per_user_limit = ${parsed.perUserLimit},
          active = ${parsed.active},
          note = ${parsed.note}
        where id = ${id}
      `;
      return null;
    });
    revalidatePath(COUPONS_PATH);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setCouponActive(id: number, active: boolean): Promise<CouponActionResult> {
  try {
    if (!Number.isInteger(id) || id < 1) return { ok: false, key: "coupons-error" };
    const { env, claims } = await staffDoor();
    await asStaff(env, claims, async (sql) => {
      await sql`
        update public.coupons set active = ${active} where id = ${id}
      `;
      return null;
    });
    revalidatePath(COUPONS_PATH);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteCoupon(id: number): Promise<CouponActionResult> {
  try {
    if (!Number.isInteger(id) || id < 1) return { ok: false, key: "coupons-error" };
    const { env, claims } = await staffDoor();
    await asStaff(env, claims, async (sql) => {
      await sql`
        delete from public.coupons where id = ${id}
      `;
      return null;
    });
    revalidatePath(COUPONS_PATH);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
