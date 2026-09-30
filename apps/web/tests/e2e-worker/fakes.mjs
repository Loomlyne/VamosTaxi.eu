// 26.5 plan 07: local stand-ins for the two outside services the checkout routes call.
// Started by run.sh next to the Worker. Local only, no real Stripe, no real Turnstile, nothing printed.
//   /__turnstile/turnstile/v0/siteverify : always success unless the token is "fail"; echoes action, hostname "localhost"
//   /__stripe/v1/checkout/sessions[...]  : a minimal Checkout Session store (create, retrieve, expire)
// run.sh prepends a fetch rewrite to the built worker.js so api.stripe.com and challenges.cloudflare.com
// reach this server (see run.sh). The build output only, never the source.
import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.E2E_FAKE_PORT ?? 4297);
const sessions = new Map(); // id -> session
const byKey = new Map(); // idempotency key -> id
const stats = { turnstile: 0, sessionsCreated: 0 };

// Stripe's form encoding: a[b][0][c]=v  ->  nested object
function parseForm(text) {
  const out = {};
  for (const [k, v] of new URLSearchParams(text)) {
    const path = k.replace(/\]/g, "").split("[");
    let o = out;
    path.forEach((p, i) => {
      if (i === path.length - 1) o[p] = v;
      else o = o[p] ??= {};
    });
  }
  return out;
}

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json", "request-id": "req_e2e_fake" });
  res.end(JSON.stringify(body));
};

http.createServer((req, res) => {
  let buf = "";
  req.on("data", (d) => (buf += d));
  req.on("end", () => {
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/__stats") return json(res, 200, stats);
    if (u.pathname === "/__turnstile/turnstile/v0/siteverify") {
      stats.turnstile++;
      const f = parseForm(buf);
      if (f.response === "fail") return json(res, 200, { success: false, "error-codes": ["invalid-input-response"] });
      return json(res, 200, { success: true, action: f.action ?? "", hostname: "localhost", challenge_ts: new Date().toISOString() });
    }
    const m = /^\/__stripe\/v1\/checkout\/sessions(?:\/([^/]+)(\/expire)?)?$/.exec(u.pathname);
    if (m) {
      const [, id, expire] = m;
      if (!id && req.method === "POST") {
        const key = req.headers["idempotency-key"];
        if (key && byKey.has(key)) return json(res, 200, sessions.get(byKey.get(key)));
        const f = parseForm(buf);
        const sid = "cs_test_e2e_" + crypto.randomBytes(8).toString("hex");
        const amount = Number(f.line_items?.["0"]?.price_data?.unit_amount);
        const s = {
          id: sid, object: "checkout.session", livemode: false,
          url: `https://checkout.stripe.com/c/pay/${sid}`,
          status: "open", payment_status: "unpaid", mode: "payment",
          currency: "chf", amount_total: amount, amount_subtotal: amount,
          customer_email: f.customer_email ?? null, client_reference_id: f.client_reference_id ?? null,
          metadata: f.metadata ?? {}, expires_at: Number(f.expires_at) || Math.floor(Date.now() / 1000) + 1860,
          payment_intent: { id: "pi_test_e2e_" + crypto.randomBytes(8).toString("hex"), object: "payment_intent", metadata: {} },
        };
        sessions.set(sid, s); if (key) byKey.set(key, sid); stats.sessionsCreated++;
        return json(res, 200, s);
      }
      const s = id && sessions.get(id);
      if (!s) return json(res, 404, { error: { type: "invalid_request_error", code: "resource_missing", message: "No such checkout.session" } });
      if (expire && req.method === "POST") { s.status = "expired"; return json(res, 200, s); }
      return json(res, 200, s);
    }
    json(res, 404, { error: { type: "invalid_request_error", message: "fake: unknown path" } });
  });
}).listen(PORT, "127.0.0.1", () => console.log(`fakes on ${PORT}`));
