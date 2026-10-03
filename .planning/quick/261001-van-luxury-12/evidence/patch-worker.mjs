// Prepends a fetch rewrite to the BUILT worker.js only (never source): Stripe and Turnstile go to tests/e2e-worker/fakes.mjs,
// api.mapbox.com goes to the scratch mapbox-fake.mjs. Same technique as apps/web/tests/e2e-worker/run.sh.
import fs from "node:fs";
const file = process.argv[2];
const fake = process.env.E2E_FAKE_PORT ?? "4397";
const map = process.env.MAP_FAKE_PORT ?? "4398";
const src = fs.readFileSync(file, "utf8");
if (src.includes("VL12_FETCH_PATCH")) process.exit(0);
const patch = `/*VL12_FETCH_PATCH*/const __vlF=globalThis.fetch;globalThis.fetch=function(i,o){try{const s=typeof i==="string"?i:(i instanceof URL?i.href:i.url);const u=new URL(s);const m={"api.stripe.com":"http://127.0.0.1:${fake}/__stripe","challenges.cloudflare.com":"http://127.0.0.1:${fake}/__turnstile","api.mapbox.com":"http://127.0.0.1:${map}/__mapbox"}[u.hostname];if(m){const n=m+u.pathname+u.search;return __vlF(typeof i==="object"&&!(i instanceof URL)?new Request(n,i):n,o)}}catch(e){}return __vlF(i,o)};\n`;
fs.writeFileSync(file, patch + src);
