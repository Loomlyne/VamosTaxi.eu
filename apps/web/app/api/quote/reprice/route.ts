// apps/web/app/api/quote/reprice/route.ts
//
// POST /api/quote/reprice. Thin on purpose: force-dynamic,
// getCloudflareContext, preprocess, run the reprice pipeline, respond.
// Any handler growing a business rule is a rule that escaped pipeline.ts.
//
// The pipeline owns Mapbox, KV, the quote identity wrapper, and the
// preview flag — this file names none of those bindings.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { wireQuoteAbuse } from "@/lib/abuse/guards";
import { withRequestContext } from "@/lib/logger";
import { buildQuotePipelineDeps, isNamedDashboardHost } from "@/lib/quote/deps";
import { preprocessWidgetTokens } from "@/lib/quote/preprocess";
import {
  runRepricePipeline,
  type PipelineRefusal,
} from "@/lib/quote/pipeline";
import { errorResponse, quoteResponse } from "@/lib/quote/respond";
import { csrfForbidden } from "@/lib/security/origin";

export const dynamic = "force-dynamic";

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
  const emit = withRequestContext({
    requestId: crypto.randomUUID(),
    route: "/api/quote/reprice",
    locale: null,
  });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    emit("info", "quote_reprice", { ok: 0 });
    return errorResponse("untrusted_input");
  }

  const pre = preprocessWidgetTokens(body);
  if (!pre.ok) {
    emit("info", "quote_reprice", { ok: 0 });
    if (pre.code === "mode_not_offered") {
      return errorResponse("mode_not_offered");
    }
    return errorResponse("untrusted_input");
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
    const result = await runRepricePipeline(pre.body, deps);
    if (!result.ok) {
      emit("info", "quote_reprice", { ok: 0 });
      return refuse(result);
    }
    emit("info", "quote_reprice", { ok: 1 });
    return quoteResponse(result);
  } catch {
    emit("warn", "quote_reprice", { ok: 0 });
    return errorResponse("temporarily_unavailable");
  }
}
