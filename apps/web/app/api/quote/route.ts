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
import { withRequestContext } from "@/lib/logger";
import { buildQuotePipelineDeps } from "@/lib/quote/deps";
import { preprocessWidgetTokens } from "@/lib/quote/preprocess";
import {
  runQuotePipeline,
  type PipelineRefusal,
} from "@/lib/quote/pipeline";
import { errorResponse, quoteResponse } from "@/lib/quote/respond";

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
  const { env } = getCloudflareContext();
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

  const deps = buildQuotePipelineDeps(env);
  // TODO(04-13): QUOTE_RATE_LIMITER / TURNSTILE_SECRET / daily Mapbox breaker
  deps.rateLimit = async () => ({ ok: true });
  deps.turnstile = async () => ({ ok: true });
  deps.mapboxBreaker = async () => ({ ok: true });

  try {
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
