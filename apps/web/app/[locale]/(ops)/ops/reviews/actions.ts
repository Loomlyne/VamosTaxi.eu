"use server";

// dynamic = "force-dynamic" — D-06 fence. A real export is illegal in a "use server" module.

import { revalidatePath } from "next/cache";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asStaff } from "@/lib/db/identity";
import {
  assertNotLocked,
  assertReviewInput,
  loadReviews,
  lockedContentTouched,
  resolveVehicleClassId,
  mapSqlState,
  planReorder,
  ReviewInputError,
  ReviewLockedError,
  type ReviewInput,
} from "@/lib/ops/reviews";
import { OpsAuthError, requireStaffClaims, type StaffAuthClient } from "@/lib/ops/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Library-style server-action module — D-06's fence greps asStaff importers
// for this export. Meaningless on a non-route file; required so the fence
// does not treat this write path as a cacheable import.

const OPS_REVIEWS_PATH = "/ops/reviews";
const PUBLIC_ROUTES = ["/", "/dev/home/reviews", OPS_REVIEWS_PATH] as const;
const LOCALES = ["en", "de", "fr", "ar"] as const;

/** `id` is set by createReview only (Phase 32: the new row's language job needs it). */
export type ReviewActionResult = { ok: true; id?: string } | { ok: false; key: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function revalidateReviews(): void {
  for (const route of PUBLIC_ROUTES) {
    revalidatePath(route);
    for (const locale of LOCALES) {
      revalidatePath(`/${locale}${route === "/" ? "" : route}`);
    }
  }
}

async function staffDoor() {
  const supabase = (await createServerSupabaseClient()) as StaffAuthClient;
  const claims = await requireStaffClaims(supabase);
  const { env } = getCloudflareContext();
  return { env, claims };
}

function fail(err: unknown): ReviewActionResult {
  if (err instanceof ReviewLockedError) return { ok: false, key: err.key };
  if (err instanceof ReviewInputError) return { ok: false, key: err.key };
  if (err instanceof OpsAuthError) return { ok: false, key: "reviews-error" };
  const mapped = mapSqlState(err);
  if (mapped.kind === "unique") return { ok: false, key: "reviews-duplicate" };
  if (mapped.kind === "check") return { ok: false, key: "reviews-rating" };
  return { ok: false, key: "reviews-error" };
}

export async function createReview(input: ReviewInput): Promise<ReviewActionResult> {
  try {
    const parsed = assertReviewInput(input);
    const { env, claims } = await staffDoor();
    const vehicleClassId = await resolveVehicleClassId(env, claims, parsed.vehicleClassId);
    const id = await asStaff(env, claims, async (sql) => {
      const inserted = await sql<{ id: string }[]>`
        insert into public.reviews (
          external_ref,
          source,
          author_name,
          author_role,
          body,
          rating,
          route_label,
          vehicle_class_id,
          avatar_path,
          source_url,
          verified,
          published,
          sort_order,
          updated_at
        ) values (
          ${parsed.externalRef},
          ${parsed.source},
          ${parsed.authorName},
          ${parsed.authorRole},
          ${parsed.body},
          ${parsed.rating},
          ${parsed.routeLabel},
          ${vehicleClassId},
          ${parsed.avatarPath},
          ${parsed.sourceUrl},
          ${parsed.verified},
          ${parsed.published},
          ${parsed.sortOrder},
          now()
        )
        returning id
      `;
      return inserted[0]?.id ?? null;
    });
    revalidateReviews();
    return id ? { ok: true, id } : { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function updateReview(id: string, input: ReviewInput): Promise<ReviewActionResult> {
  try {
    if (!isUuid(id)) return { ok: false, key: "reviews-error" };
    const { env, claims } = await staffDoor();
    const rows = await loadReviews(env, claims);
    const row = rows.find((item) => item.id === id);
    if (!row) return { ok: false, key: "reviews-error" };
    const rewrite = lockedContentTouched(row, input);
    // Phase 32 (D-09): a text change clears the stored language, so the language job (which skips a
    // review that already has one) detects the new text. Same text keeps it. In an UPDATE the right-
    // hand `body` is the stored value.
    if (rewrite) assertNotLocked(row);
    const parsed = assertReviewInput(input);
    const vehicleClassId = await resolveVehicleClassId(env, claims, parsed.vehicleClassId);
    await asStaff(env, claims, async (sql) => {
      if (rewrite) {
        await sql`
          update public.reviews set
            external_ref = ${parsed.externalRef},
            source = ${parsed.source},
            author_name = ${parsed.authorName},
            author_role = ${parsed.authorRole},
            body = ${parsed.body},
            rating = ${parsed.rating},
            route_label = ${parsed.routeLabel},
            vehicle_class_id = ${vehicleClassId},
            avatar_path = ${parsed.avatarPath},
            source_url = ${parsed.sourceUrl},
            verified = ${parsed.verified},
            published = ${parsed.published},
            sort_order = ${parsed.sortOrder},
            language = case when body = ${parsed.body} then language else null end,
            updated_at = now()
          where id = ${id}
        `;
      } else {
        await sql`
          update public.reviews set
            author_name = ${parsed.authorName},
            body = ${parsed.body},
            rating = ${parsed.rating},
            published = ${parsed.published},
            sort_order = ${parsed.sortOrder},
            verified = ${parsed.verified},
            vehicle_class_id = ${vehicleClassId},
            avatar_path = ${parsed.avatarPath},
            route_label = ${parsed.routeLabel},
            source_url = ${parsed.sourceUrl},
            language = case when body = ${parsed.body} then language else null end,
            updated_at = now()
          where id = ${id}
        `;
      }
      return null;
    });
    revalidateReviews();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setReviewPublished(
  id: string,
  published: boolean,
): Promise<ReviewActionResult> {
  try {
    if (!isUuid(id)) return { ok: false, key: "reviews-error" };
    const { env, claims } = await staffDoor();
    await asStaff(env, claims, async (sql) => {
      await sql`
        update public.reviews set
          published = ${published},
          updated_at = now()
        where id = ${id}
      `;
      return null;
    });
    revalidateReviews();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function moveReview(
  id: string,
  direction: "up" | "down",
): Promise<ReviewActionResult> {
  try {
    if (!isUuid(id)) return { ok: false, key: "reviews-error" };
    if (direction !== "up" && direction !== "down") return { ok: false, key: "reviews-error" };
    const { env, claims } = await staffDoor();
    const rows = await loadReviews(env, claims);
    const plan = planReorder(rows, id, direction);
    if (plan.length === 0) return { ok: true };
    await asStaff(env, claims, async (sql) => {
      for (const item of plan) {
        await sql`
          update public.reviews set
            sort_order = ${item.sortOrder},
            updated_at = now()
          where id = ${item.id}
        `;
      }
      return null;
    });
    revalidateReviews();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteReview(id: string): Promise<ReviewActionResult> {
  try {
    if (!isUuid(id)) return { ok: false, key: "reviews-error" };
    const { env, claims } = await staffDoor();
    await asStaff(env, claims, async (sql) => {
      await sql`
        delete from public.reviews where id = ${id}
      `;
      return null;
    });
    revalidateReviews();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
