// apps/web/app/api/geo/retrieve/route.ts
//
// Pick proxy (D-15, D-47, D-51). Temporary Geocodes only — coordinates exist
// so the widget can drop a pin; they are not persisted here. Plan 04-13 wraps
// this route with rate-limit, breaker and Turnstile — add none of those here.
//
// hasSeenSession gates this handler BEFORE the Mapbox call (AM-03): without
// it, /retrieve is an unmetered geocoder for anyone who can guess a
// mapbox_id. Fail closed when KV is unavailable.
//
// A Mapbox error body can echo the query string back, which is the
// customer's home address — never return statusText, err.message, or an
// upstream body.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";
import { withRequestContext } from "@/lib/logger";
import { quoteErrorResponse } from "@/lib/quote/errors";
import { retrieve } from "@/lib/geo/mapbox";
import { hasSeenSession, sessionBucket } from "@/lib/geo/session";

// Route Handlers are dynamic by default; the explicit export is what keeps
// getCloudflareContext() away from build-time static generation (these read
// runtime bindings and must never be statically evaluated at build).
export const dynamic = "force-dynamic";

const LOCALES = ["en", "de", "fr", "ar"] as const;

const RetrieveQuery = z
  .object({
    mapbox_id: z.string().min(1).max(256),
    session_token: z.string().uuid(),
    locale: z.enum(LOCALES),
  })
  .strict();

export async function GET(request: Request) {
  const { env } = getCloudflareContext();
  const url = new URL(request.url);
  const parsed = RetrieveQuery.safeParse(
    Object.fromEntries(url.searchParams.entries()),
  );
  const locale = parsed.success ? parsed.data.locale : null;
  const emit = withRequestContext({
    requestId: crypto.randomUUID(),
    route: "/api/geo/retrieve",
    locale,
  });

  if (!parsed.success) {
    emit("info", "geo_retrieve", { ok: 0 });
    return quoteErrorResponse("untrusted_input");
  }

  const seen = await hasSeenSession(
    env,
    parsed.data.session_token,
    sessionBucket(request),
  );
  if (!seen) {
    emit("info", "geo_retrieve", { seen: 0 });
    return quoteErrorResponse("retrieve_without_suggest");
  }

  try {
    const result = await retrieve(
      {
        mapboxId: parsed.data.mapbox_id,
        sessionToken: parsed.data.session_token,
        language: parsed.data.locale,
      },
      env,
    );
    emit("info", "geo_retrieve", { seen: 1, has_place: result.place ? 1 : 0 });
    return Response.json({ ok: true, place: result.place });
  } catch {
    emit("warn", "geo_retrieve", { degraded: 1 });
    return Response.json({ ok: true, place: null });
  }
}
