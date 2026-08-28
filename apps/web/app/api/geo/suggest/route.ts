// apps/web/app/api/geo/suggest/route.ts
//
// Type-ahead proxy (D-15, D-47). MAPBOX_TOKEN never leaves the Worker.
// No coordinates in the response body. Plan 04-13 wraps this route with
// rate-limit, breaker and Turnstile — add none of those here.
//
// A Mapbox error body can echo the query string back, which is the
// customer's home address — never return statusText, err.message, or an
// upstream body.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";
import { withRequestContext } from "@/lib/logger";
import { quoteErrorResponse } from "@/lib/quote/errors";
import { suggest } from "@/lib/geo/mapbox";
import { publicSuggestion, rememberSession, sessionBucket } from "@/lib/geo/session";

// Route Handlers are dynamic by default; the explicit export is what keeps
// getCloudflareContext() away from build-time static generation (these read
// runtime bindings and must never be statically evaluated at build).
export const dynamic = "force-dynamic";

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

  // A type-ahead that 400s on the second keystroke is a broken field, not a
  // validated one — short q is an empty list, not an error. Do not
  // rememberSession here: a two-character 200 must not unlock /retrieve
  // (AM-03). The session is recorded only after a real suggest attempt below.
  if (parsed.data.q.length < 3) {
    return Response.json({ ok: true, suggestions: [] });
  }

  const proximity = parseProximity(parsed.data.proximity);
  if (parsed.data.proximity !== undefined && proximity === undefined) {
    return quoteErrorResponse("untrusted_input");
  }

  try {
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
      return Response.json({ ok: true, suggestions: [], degraded: true });
    }
    return Response.json({ ok: true, suggestions });
  } catch {
    emit("warn", "geo_suggest", { degraded: 1 });
    return Response.json({ ok: true, suggestions: [], degraded: true });
  }
}
