// apps/web/app/api/quote/route.ts
//
// POST /api/quote. Thin on purpose: force-dynamic, getCloudflareContext,
// preprocess widget tokens (D-04), run the pipeline, hand the result to
// respond.ts. Any handler growing a business rule is a rule that escaped
// pipeline.ts.
//
// The pipeline owns Mapbox, KV, the quote identity wrapper, and the
// preview flag — this file names none of those bindings.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { wireQuoteAbuse } from "@/lib/abuse/guards";
import { getContentStrings } from "@/lib/db/content";
import { loadRateBook } from "@/lib/db/quote";
import { withRequestContext } from "@/lib/logger";
import { liveBookBoard, publicCatalogRoutes } from "@/lib/pricing/public-board";
import { mapRateBook } from "@/lib/pricing/rateBook";
import { buildQuotePipelineDeps, isNamedDashboardHost } from "@/lib/quote/deps";
import { preprocessWidgetTokens } from "@/lib/quote/preprocess";
import {
  runQuotePipeline,
  type PipelineRefusal,
} from "@/lib/quote/pipeline";
import { errorResponse, quoteResponse } from "@/lib/quote/respond";
import { csrfForbidden } from "@/lib/security/origin";
import { lockSecretPresent } from "@/lib/quote/lock-secret";

export const dynamic = "force-dynamic";

/** Idle home strip: live-book classes, CHF 000 until POST prices a trip. */
export async function GET() {
  try {
    const { env } = getCloudflareContext();
    const raw = await loadRateBook(env, { preferDraft: false });
    const book = mapRateBook(raw);
    let names = new Map<string, string>();
    try {
      const keys = [
        ...new Set(
          book.zones
            .map((zone) => zone.slug)
            .filter((slug) => typeof slug === "string" && slug.length > 0),
        ),
      ].map((slug) => `zone.${slug}`);
      if (keys.length) {
        const rows = await getContentStrings(env, keys);
        for (const row of rows) {
          if (!row.key.startsWith("zone.")) continue;
          const name = row.en.trim();
          if (name) names.set(row.key.slice("zone.".length), name);
        }
      }
    } catch {
      names = new Map();
    }
    return Response.json(
      {
        ok: true,
        classes: liveBookBoard(book),
        fixed_routes: publicCatalogRoutes(book, names),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json(
      { ok: true, classes: [], fixed_routes: [] },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

function refuse(result: PipelineRefusal) {
  if (result.code === "min_advance" && result.params) {
    return errorResponse("min_advance", result.params);
  }
  if (result.code === "min_advance") {
    return errorResponse("untrusted_input");
  }
  return errorResponse(result.code as Exclude<import("@/lib/quote/errors").QuoteErrorCode, "min_advance">);
}

export async function POST(request: Request) {
  const csrf = csrfForbidden(request, "auth");
  if (csrf) return csrf;
  const { env } = getCloudflareContext();
  if (!lockSecretPresent(env.QUOTE_LOCK_SECRET || process.env.QUOTE_LOCK_SECRET, "/api/quote")) {
    return errorResponse("temporarily_unavailable");
  }
  let locale: string | null = null;
  const emit = withRequestContext({
    requestId: crypto.randomUUID(),
    route: "/api/quote",
    locale,
  });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    emit("info", "quote", { ok: 0 });
    return errorResponse("untrusted_input");
  }

  const pre = preprocessWidgetTokens(body);
  if (!pre.ok) {
    emit("info", "quote", { ok: 0 });
    if (pre.code === "mode_not_offered") {
      return errorResponse("mode_not_offered");
    }
    return errorResponse("untrusted_input");
  }
  if (typeof pre.body.locale === "string") {
    locale = pre.body.locale;
  }

  const deps = buildQuotePipelineDeps(env, {
    dashboardHost: isNamedDashboardHost(new URL(request.url).host),
  });

  try {
    const abuse = await wireQuoteAbuse(env, request);
    deps.rateLimit = abuse.rateLimit;
    deps.turnstile = abuse.turnstile;
    deps.mapboxBreaker = abuse.mapboxBreaker;
    deps.qsSubject = abuse.qsSubject;
    deps.geoSession = abuse.geoSession;
    const result = await runQuotePipeline(pre.body, deps);
    if (!result.ok) {
      emit("info", "quote", { ok: 0 });
      return refuse(result);
    }
    emit("info", "quote", { ok: 1 });
    return quoteResponse(result);
  } catch (err) {
    const name = err instanceof Error ? err.name : "unknown";
    emit("warn", "quote", { ok: 0, err_name: name });
    return errorResponse("temporarily_unavailable");
  }
}
