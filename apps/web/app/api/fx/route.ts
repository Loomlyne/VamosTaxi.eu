// GET /api/fx — CHF→EUR/USD/AED for display. Charge stays CHF.

import { loadFxRates, type FxPayload } from "@/lib/fx/fetchRates";

export const dynamic = "force-dynamic";

const CACHE_MS = 60 * 60 * 1000;
const CACHE_CONTROL = "public, max-age=3600";

let memo: { at: number; body: FxPayload } | null = null;

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": status === 200 ? CACHE_CONTROL : "private, no-store",
    },
  });
}

export async function GET() {
  const now = Date.now();
  if (memo && now - memo.at < CACHE_MS) {
    return json({ ok: true, ...memo.body });
  }
  try {
    const body = await loadFxRates();
    memo = { at: now, body };
    return json({ ok: true, ...body });
  } catch {
    if (memo) return json({ ok: true, ...memo.body, stale: true });
    return json({ ok: false, code: "fx_unavailable" }, 503);
  }
}
