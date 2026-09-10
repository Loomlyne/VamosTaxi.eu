// apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/assign/route.ts
//
// POST /api/staff/bookings/:id/assign — chauffeur uuid only. Dual-mounted
// at app/api/staff/bookings/[id]/assign. withStaff then asSystem RPC.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { assignBooking } from "@/lib/ops/assign";
import { jsonErr, jsonOk, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bookingKey(request: Request): string | null {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const i = parts.lastIndexOf("bookings");
  const id = parts[i + 1] ?? "";
  if (!id || id === "assign" || id === "unassign") return null;
  return id;
}

function failStatus(code: string): number {
  if (code === "not-found") return 404;
  if (code === "csrf") return 403;
  if (
    code === "overlap" ||
    code === "frozen" ||
    code === "not-paid" ||
    code === "no-email" ||
    code === "no-vehicle" ||
    code === "capacity"
  ) {
    return 409;
  }
  return 400;
}

export const POST = withStaff(async (claims, request) => {
  const id = bookingKey(request);
  if (!id) return jsonErr("not-found", 404);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonErr("invalid-json", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonErr("invalid-json", 400);
  }
  const chauffeurId = (body as Record<string, unknown>).chauffeurId;
  if (typeof chauffeurId !== "string" || !UUID.test(chauffeurId.trim())) {
    return jsonErr("invalid-json", 400);
  }
  const { env } = getCloudflareContext();
  const result = await assignBooking(env, claims, id, chauffeurId);
  if (!result.ok) {
    if (result.code === "overlap") {
      return jsonErr("overlap", 409, {
        otherRef: result.otherRef ?? "",
        otherLocal: result.otherLocal ?? "",
      });
    }
    return jsonErr(result.code, failStatus(result.code));
  }
  return jsonOk({
    id,
    bookingId: result.bookingId,
    chauffeurId: result.chauffeurId,
    vehicleId: result.vehicleId,
  });
});
