// apps/web/app/[locale]/(ops)/api/staff/reviews/route.ts
//
// GET /api/staff/reviews — staff list (empty [] is the shipping state).
// POST /api/staff/reviews — create via createReview. Dual-mounted at
// app/api/staff/reviews so the DC mock can hit /api/staff/reviews despite
// <base href="/app/ops/">. asStaff lives inside the wrapped loaders/actions.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  createReview,
  type ReviewActionResult,
} from "@/app/[locale]/(ops)/ops/reviews/actions";
import { jsonErr, jsonOk, withStaff } from "@/lib/ops/staff-json";
import { loadReviews, type ReviewInput, type ReviewSource } from "@/lib/ops/reviews";

export const dynamic = "force-dynamic";

const SOURCES = new Set(["google", "tripadvisor", "trustpilot", "manual"]);

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function actionStatus(result: Extract<ReviewActionResult, { ok: false }>): number {
  if (result.key === "reviews-duplicate") return 409;
  if (result.key === "reviews-locked") return 409;
  return 400;
}

export function reviewInputFromBody(body: Record<string, unknown>): ReviewInput {
  const sourceRaw = str(body.source);
  const source = SOURCES.has(sourceRaw) ? (sourceRaw as ReviewSource) : undefined;
  const ratingRaw = body.rating;
  const rating = typeof ratingRaw === "number" ? ratingRaw : Number(ratingRaw);
  const vehicleClassId =
    str(body.vehicleClassId) || str(body.vehicleClassSlug) || str(body.vehicleClass);
  const avatarPath = str(body.avatarPath ?? body.avatar);
  const sourceUrl = str(body.sourceUrl ?? body.url);
  const sortRaw = body.sortOrder;
  return {
    externalRef: body.externalRef == null ? null : str(body.externalRef),
    source,
    authorName: str(body.authorName ?? body.name),
    authorRole: str(body.authorRole ?? body.role),
    body: str(body.body ?? body.text),
    rating: Number.isFinite(rating) ? rating : 0,
    routeLabel: str(body.routeLabel ?? body.route),
    vehicleClassId: vehicleClassId || null,
    avatarPath: avatarPath || null,
    sourceUrl: sourceUrl || null,
    verified: body.verified === true,
    published: body.published !== false,
    sortOrder: typeof sortRaw === "number" && Number.isInteger(sortRaw) ? sortRaw : undefined,
  };
}

export const GET = withStaff(async (claims) => {
  const { env } = getCloudflareContext();
  const rows = await loadReviews(env, claims);
  return jsonOk(rows);
});

export const POST = withStaff(async (claims, request) => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonErr("reviews-error", 400);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return jsonErr("reviews-error", 400);
  }
  const result = await createReview(reviewInputFromBody(raw as Record<string, unknown>));
  if (!result.ok) return jsonErr(result.key, actionStatus(result));
  const { env } = getCloudflareContext();
  return jsonOk(await loadReviews(env, claims), 201);
});
