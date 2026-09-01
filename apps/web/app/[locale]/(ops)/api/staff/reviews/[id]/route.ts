// apps/web/app/[locale]/(ops)/api/staff/reviews/[id]/route.ts
//
// PATCH /api/staff/reviews/:id — fields, published, or move up/down (D-25).
// DELETE /api/staff/reviews/:id. Dual-mounted at app/api/staff/reviews/[id].

import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  deleteReview,
  moveReview,
  setReviewPublished,
  updateReview,
  type ReviewActionResult,
} from "@/app/[locale]/(ops)/ops/reviews/actions";
import { jsonErr, jsonOk, withStaff } from "@/lib/ops/staff-json";
import { loadReviews, type ReviewInput } from "@/lib/ops/reviews";
import { reviewInputFromBody } from "../route";

export const dynamic = "force-dynamic";

function actionStatus(result: Extract<ReviewActionResult, { ok: false }>): number {
  if (result.key === "reviews-duplicate") return 409;
  if (result.key === "reviews-locked") return 409;
  return 400;
}

function rowToInput(row: {
  externalRef: string | null;
  source: ReviewInput["source"];
  authorName: string;
  authorRole: string;
  body: string;
  rating: number;
  routeLabel: string;
  vehicleClassId: string | null;
  avatarPath: string | null;
  sourceUrl: string | null;
  verified: boolean;
  published: boolean;
  sortOrder: number;
}): ReviewInput {
  return {
    externalRef: row.externalRef,
    source: row.source,
    authorName: row.authorName,
    authorRole: row.authorRole,
    body: row.body,
    rating: row.rating,
    routeLabel: row.routeLabel,
    vehicleClassId: row.vehicleClassId,
    avatarPath: row.avatarPath,
    sourceUrl: row.sourceUrl,
    verified: row.verified,
    published: row.published,
    sortOrder: row.sortOrder,
  };
}

export function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return withStaff(async (claims) => {
    const { id } = await context.params;
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return jsonErr("reviews-error", 400);
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return jsonErr("reviews-error", 400);
    }
    const body = raw as Record<string, unknown>;
    const move = body.move;
    if (move === "up" || move === "down") {
      const moved = await moveReview(id, move);
      if (!moved.ok) return jsonErr(moved.key, actionStatus(moved));
      const { env } = getCloudflareContext();
      return jsonOk(await loadReviews(env, claims));
    }

    const keys = Object.keys(body);
    if (keys.length === 1 && typeof body.published === "boolean") {
      const published = await setReviewPublished(id, body.published);
      if (!published.ok) return jsonErr(published.key, actionStatus(published));
      const { env } = getCloudflareContext();
      return jsonOk(await loadReviews(env, claims));
    }

    const { env } = getCloudflareContext();
    const rows = await loadReviews(env, claims);
    const row = rows.find((item) => item.id === id);
    if (!row) return jsonErr("reviews-error", 404);
    const merged = { ...rowToInput(row), ...reviewInputFromBody(body) };
    const updated = await updateReview(id, merged);
    if (!updated.ok) return jsonErr(updated.key, actionStatus(updated));
    return jsonOk(await loadReviews(env, claims));
  })(request);
}

export function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return withStaff(async (claims) => {
    const { id } = await context.params;
    const result = await deleteReview(id);
    if (!result.ok) return jsonErr(result.key, actionStatus(result));
    const { env } = getCloudflareContext();
    return jsonOk(await loadReviews(env, claims));
  })(request);
}
