// apps/web/app/api/geo/reverse/route.ts
//
// Dropped-pin proxy — Geocoding v6, no session (D-15, D-47).
// Invisible challenge stays off type-ahead (§8). The breaker still counts
// these calls (D-37).
//
// A Mapbox error body can echo the query string back, which is the
// customer's home address — never return statusText, err.message, or an
// upstream body.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";
import { countMapboxUnit } from "@/lib/abuse/breaker";
import { wireBreakerGuard, wireRateLimitGuard } from "@/lib/abuse/guards";
import { withRequestContext } from "@/lib/logger";
import { quoteErrorResponse } from "@/lib/quote/errors";
import { reverse } from "@/lib/geo/mapbox";

// Route Handlers are dynamic by default; the explicit export is what keeps
// getCloudflareContext() away from build-time static generation (these read
// runtime bindings and must never be statically evaluated at build).
export const dynamic = "force-dynamic";

const LOCALES = ["en", "de", "fr", "ar"] as const;

const queryFiniteNumber = z
  .string()
  .min(1)
  .max(32)
  .refine((s) => Number.isFinite(Number(s)))
  .transform((s) => Number(s));

const ReverseQuery = z
  .object({
    lng: queryFiniteNumber,
    lat: queryFiniteNumber,
    locale: z.enum(LOCALES),
  })
  .strict();

export async function GET(request: Request) {
  const { env } = getCloudflareContext();
  const url = new URL(request.url);
  const parsed = ReverseQuery.safeParse(
    Object.fromEntries(url.searchParams.entries()),
  );
  const locale = parsed.success ? parsed.data.locale : null;
  const emit = withRequestContext({
    requestId: crypto.randomUUID(),
    route: "/api/geo/reverse",
    locale,
  });

  if (!parsed.success) {
    emit("info", "geo_reverse", { ok: 0 });
    return quoteErrorResponse("untrusted_input");
  }

  const limited = await wireRateLimitGuard(env, request)();
  if (!limited.ok) return quoteErrorResponse(limited.code);
  const broken = await wireBreakerGuard(env)();
  if (!broken.ok) return quoteErrorResponse(broken.code);

  try {
    // D-37: the breaker counts calls, not endpoints, and three of the four
    // billable shapes are geo. This is Geocoding v6 /reverse.
    await countMapboxUnit(env);
    const result = await reverse(
      {
        lng: parsed.data.lng,
        lat: parsed.data.lat,
        language: parsed.data.locale,
      },
      env,
    );
    emit("info", "geo_reverse", { has_place: result.place ? 1 : 0 });
    return Response.json({ ok: true, place: result.place });
  } catch {
    emit("warn", "geo_reverse", { degraded: 1 });
    return Response.json({ ok: true, place: null });
  }
}
