// POST /api/track — the browser tells our server that a vehicle was chosen (owner wording 2026-10-09).
// Our server, not the browser, then sends InitiateCheckout to Meta, so the page address (the route in the
// /checkout query) never reaches Meta. Answers 204 for every well-formed request, whatever happens next:
// the browser never learns whether consent, flags or Meta said yes. Never reads a booking, never returns a value.
//
// Checks, in order: public Origin (a missing Origin is a refusal), a strict body, a rate limit per IP, then in
// the background: flags, Marketing consent read now, a Meta cookie id, token, test code in test mode.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { checkWriteRateLimit } from "@/lib/abuse/rate-limit";
import { cfConnectingIp } from "@/lib/consent/ip";
import { asCheckout } from "@/lib/db/identity";
import { readConsentChoice } from "@/lib/consent/read";
import { csrfForbidden } from "@/lib/security/origin";
import { metaEventsAllowed } from "@/lib/meta/legal-gate";
import { metaFunnelDepsFromEnv, scheduleFunnelEvent, sendFunnelEvent } from "@/lib/meta/funnel";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_VALUE_RAPPEN = 2_000_000;

function reply(status: number): Response {
  return new Response(null, { status, headers: { "cache-control": "private, no-store" } });
}

type Body = { event: "InitiateCheckout"; id: string; valueRappen: number };

function parse(json: unknown): Body | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  const keys = Object.keys(o).sort().join(",");
  if (keys !== "event,id,value_rappen") return null;
  if (o.event !== "InitiateCheckout") return null;
  if (typeof o.id !== "string" || !UUID_RE.test(o.id)) return null;
  const v = o.value_rappen;
  if (typeof v !== "number" || !Number.isInteger(v) || v <= 0 || v > MAX_VALUE_RAPPEN) return null;
  return { event: "InitiateCheckout", id: o.id.toLowerCase(), valueRappen: v };
}

export async function POST(request: Request): Promise<Response> {
  try {
    const blocked = csrfForbidden(request, "public");
    if (blocked) return blocked;
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return reply(400);
    }
    const body = parse(json);
    if (!body) return reply(400);
    // Flags closed: nothing to do, and nothing to learn from the answer.
    if (!metaEventsAllowed()) return reply(204);

    const { env, ctx } = getCloudflareContext();
    const limiter = env.QUOTE_RATE_LIMITER;
    if (limiter) {
      const ok = await checkWriteRateLimit({ limiter, kind: "track", ip: cfConnectingIp(request.headers) ?? "unknown" });
      if (!ok.ok) return reply(429);
    }
    const deps = metaFunnelDepsFromEnv(env);
    await scheduleFunnelEvent({
      ctx,
      decide: {
        cookieHeader: request.headers.get("cookie"),
        origin: request.headers.get("origin"),
        readMarketing: (subject) =>
          asCheckout(env, null, (tx) => readConsentChoice(tx, subject)).then((c) => c?.marketing === true),
      },
      event: async (ids) => {
        await sendFunnelEvent(
          {
            name: "InitiateCheckout",
            eventId: body.id,
            valueRappen: body.valueRappen,
            orderId: null,
            fbp: ids.fbp,
            fbc: ids.fbc,
          },
          deps,
        );
      },
    });
    return reply(204);
  } catch {
    return reply(204);
  }
}
