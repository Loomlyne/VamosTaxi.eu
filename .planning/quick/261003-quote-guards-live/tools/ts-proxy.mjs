// Quick 261003 quote-guards-live: stands where the lab's fakes server stood (the worker.js fetch patch
// sends api.stripe.com / api.mapbox.com / api.resend.com / challenges.cloudflare.com here).
//   - The QUOTE guard's siteverify (JSON body, lib/abuse/turnstile.ts) goes to the REAL Cloudflare
//     siteverify, so the proof uses Cloudflare's public Turnstile test secrets, not a stand-in.
//   - Everything else (the checkout account gate's form-encoded siteverify, Stripe, Mapbox, Resend)
//     goes on to the lab's fakes.mjs, exactly as in every lab run. The account gate checks
//     action=account, which Cloudflare's test secrets never return, so it cannot use them.
// Logs one line per call; never the secret itself, only which public test secret it was.
import http from "node:http";
import fs from "node:fs";

const PORT = Number(process.env.PROXY_PORT ?? 4717);
const FAKES = Number(process.env.FAKES_PORT ?? 4719);
const LOG = process.env.PROXY_LOG ?? "/dev/stdout";
const log = (o) => fs.appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), ...o }) + "\n");
const kindOf = (s) => (typeof s !== "string" ? "none" : s.startsWith("1x") ? "test-always-pass" : s.startsWith("2x") ? "test-always-fail" : s.startsWith("3x") ? "test-timeout-or-duplicate" : "other");

http
  .createServer((req, res) => {
    const chunks = [];
    req.on("data", (d) => chunks.push(d));
    req.on("end", async () => {
      const body = Buffer.concat(chunks);
      const ct = String(req.headers["content-type"] ?? "");
      try {
        if (req.url.startsWith("/__turnstile/") && ct.includes("application/json")) {
          const sent = JSON.parse(body.toString("utf8"));
          const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: body.toString("utf8"),
          });
          const text = await r.text();
          let parsed = null;
          try { parsed = JSON.parse(text); } catch {}
          log({ route: "quote-siteverify-REAL", secret: kindOf(sent.secret), token: String(sent.response ?? "").slice(0, 24), status: r.status, success: parsed?.success ?? null, codes: parsed?.["error-codes"] ?? null });
          res.writeHead(r.status, { "content-type": "application/json" });
          return res.end(text);
        }
        const r = await fetch(`http://127.0.0.1:${FAKES}${req.url}`, {
          method: req.method,
          headers: Object.fromEntries(Object.entries(req.headers).filter(([k]) => !["host", "content-length", "connection"].includes(k))),
          body: ["GET", "HEAD"].includes(req.method) ? undefined : body,
        });
        if (req.url.startsWith("/__turnstile/")) log({ route: "account-siteverify-fake", status: r.status });
        const buf = Buffer.from(await r.arrayBuffer());
        res.writeHead(r.status, { "content-type": r.headers.get("content-type") ?? "application/json" });
        res.end(buf);
      } catch (e) {
        log({ route: req.url, error: String(e).slice(0, 200) });
        res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "proxy" }));
      }
    });
  })
  .listen(PORT, "127.0.0.1");
