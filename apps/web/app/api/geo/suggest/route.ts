// apps/web/app/api/geo/suggest/route.ts
//
// Type-ahead proxy (D-15, D-47). MAPBOX_TOKEN never leaves the Worker.
// No coordinates in the response body.
// Invisible challenge stays off type-ahead (§8) — a challenge on this field
// is how "book in under a minute" stops being true. Rate-limit and breaker
// still run.
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
import { suggest } from "@/lib/geo/mapbox";
import { publicSuggestion, rememberSession, sessionBucket } from "@/lib/geo/session";

// Route Handlers are dynamic by default; the explicit export is what keeps
// getCloudflareContext() away from build-time static generation (these read
// runtime bindings and must never be statically evaluated at build).
export const dynamic = "force-dynamic";

const GEO_JSON = { "Cache-Control": "private, no-store" };

const LOCALES = ["en", "de", "fr", "ar"] as const;

const SuggestQuery = z
  .object({
    q: z.string().min(0).max(200),
    session_token: z.string().uuid(),
    locale: z.enum(LOCALES),
    proximity: z.string().optional(),
  })
  .strict();

function parseProximity(
  raw: string | undefined,
): { lng: number; lat: number } | undefined {
  if (!raw) return undefined;
  const parts = raw.split(",");
  if (parts.length !== 2) return undefined;
  const lngStr = parts[0]?.trim() ?? "";
  const latStr = parts[1]?.trim() ?? "";
  if (lngStr.length === 0 || latStr.length === 0) return undefined;
  const lng = Number(lngStr);
  const lat = Number(latStr);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return undefined;
  return { lng, lat };
}

export async function GET(request: Request) {
  const { env } = getCloudflareContext();
  const url = new URL(request.url);
  const parsed = SuggestQuery.safeParse(
    Object.fromEntries(url.searchParams.entries()),
  );
  const locale = parsed.success ? parsed.data.locale : null;
  const emit = withRequestContext({
    requestId: crypto.randomUUID(),
    route: "/api/geo/suggest",
    locale,
  });

  if (!parsed.success) {
    emit("info", "geo_suggest", { ok: 0 });
    return quoteErrorResponse("untrusted_input");
  }

  const limited = await wireRateLimitGuard(env, request)();
  if (!limited.ok) return quoteErrorResponse(limited.code);
  const broken = await wireBreakerGuard(env)();
  if (!broken.ok) return quoteErrorResponse(broken.code);

  // A type-ahead that 400s on the first keystroke is a broken field, not a
  // validated one — short q is an empty list, not an error. Do not
  // rememberSession here: a one-character 200 must not unlock /retrieve
  // (AM-03). The session is recorded only after a real suggest attempt below.
  if (parsed.data.q.trim().length < 2) {
    return Response.json({ ok: true, suggestions: [] }, { headers: GEO_JSON });
  }

  const proximity = parseProximity(parsed.data.proximity);
  if (parsed.data.proximity !== undefined && proximity === undefined) {
    return quoteErrorResponse("untrusted_input");
  }

  try {
    // D-37: the breaker counts calls, not endpoints, and three of the four
    // billable shapes are geo. This is Search Box /suggest.
    await countMapboxUnit(env);
    const result = await suggest(
      {
        q: parsed.data.q,
        sessionToken: parsed.data.session_token,
        language: parsed.data.locale,
        proximity,
      },
      env,
    );
    await rememberSession(env, parsed.data.session_token, sessionBucket(request));
    const suggestions = result.suggestions.map((hit) => publicSuggestion(hit));
    emit("info", "geo_suggest", {
      suggestion_count: suggestions.length,
      degraded: result.degraded ? 1 : 0,
    });
    if (result.degraded) {
      return Response.json({ ok: true, suggestions: [], degraded: true }, { headers: GEO_JSON });
    }
    return Response.json({ ok: true, suggestions }, { headers: GEO_JSON });
  } catch {
    emit("warn", "geo_suggest", { degraded: 1 });
    return Response.json({ ok: true, suggestions: [], degraded: true }, { headers: GEO_JSON });
  }
}
