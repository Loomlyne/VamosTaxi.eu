// Prepends a fetch rewrite to the BUILT worker.js only (never source): Stripe, Turnstile, Mapbox and Resend all go to the one local fake (fakes-audit.mjs).
import fs from "node:fs";
const file = process.argv[2];
const fake = process.env.E2E_FAKE_PORT;
const src = fs.readFileSync(file, "utf8");
if (src.includes("AUD_FETCH_PATCH")) process.exit(0);
const patch = `/*AUD_FETCH_PATCH*/const __aF=globalThis.fetch;globalThis.fetch=function(i,o){try{const s=typeof i==="string"?i:(i instanceof URL?i.href:i.url);const u=new URL(s);const m={"api.stripe.com":"/__stripe","challenges.cloudflare.com":"/__turnstile","api.mapbox.com":"/__mapbox","api.resend.com":"/__resend"}[u.hostname];if(m){const n="http://127.0.0.1:${fake}"+m+u.pathname+u.search;return __aF(typeof i==="object"&&!(i instanceof URL)?new Request(n,i):n,o)}}catch(e){}return __aF(i,o)};\n`;
fs.writeFileSync(file, patch + src);
