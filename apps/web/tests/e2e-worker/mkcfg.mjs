import fs from "node:fs";
const dir = process.argv[2];
const strip = s => s.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m,g)=>g||"").replace(/,(\s*[}\]])/g,"$1");
const API_PORT = process.env.SB_API_PORT ?? "57321", DB_PORT = process.env.SB_DB_PORT ?? "57322"; // 26.5-10: a second stack (e.g. 613xx) can run this without touching the auth stack
const c = JSON.parse(strip(fs.readFileSync(dir+"/wrangler.jsonc","utf8")));
const e = c.env.staging;
const cfg = { name:"vamos-e2e", main:c.main, compatibility_date:c.compatibility_date, compatibility_flags:c.compatibility_flags,
  assets:c.assets, vars:e.vars, kv_namespaces:e.kv_namespaces, r2_buckets:e.r2_buckets,
  queues:{producers:e.queues.producers}, ratelimits:e.ratelimits, analytics_engine_datasets:e.analytics_engine_datasets,
  send_email:e.send_email,
  hyperdrive:[{binding:"HYPERDRIVE",id:"00000000000000000000000000000001",localConnectionString:`postgres://vamos_public:vamos_public@127.0.0.1:${DB_PORT}/postgres`},
              {binding:"HYPERDRIVE_NOCACHE",id:"00000000000000000000000000000002",localConnectionString:`postgres://vamos_edge:vamos_edge@127.0.0.1:${DB_PORT}/postgres`}]};
fs.writeFileSync(dir+"/wrangler.e2e.jsonc", JSON.stringify(cfg,null,1));
// dev vars
const env = Object.fromEntries(fs.readFileSync(process.argv[3],"utf8").split("\n").filter(Boolean).map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1).replace(/^"|"$/g,"")]}));
const secret = fs.readFileSync(process.argv[4],"utf8").trim();
const v = {SUPABASE_URL:`http://127.0.0.1:${API_PORT}`,SUPABASE_ANON_KEY:env.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:env.SERVICE_ROLE_KEY,SEND_EMAIL_HOOK_SECRET:secret,STAFF_REAUTH_SECRET:"e2e-local-reauth-secret-0123456789abcdef"};
fs.writeFileSync(dir+"/.dev.vars", Object.entries(v).map(([k,x])=>`${k}="${x}"`).join("\n")+"\n",{mode:0o600});

// 26.5-07: phase 2 (checkout-account scenarios) adds local stand-in secrets. Never real keys: the Stripe key is
// a fake that only the local fake server (fakes.mjs) ever sees, and the lock secret signs locks minted by the e2e itself.
if (process.argv[5] === "phase2") {
  Object.assign(v, {
    STRIPE_SECRET_KEY: "sk_test_e2e_fake_local_only",
    QUOTE_LOCK_SECRET: "e2e-local-lock-secret-0123456789abcdef",
    TURNSTILE_SECRET_KEY: "e2e-local-turnstile-fake",
    CONTACT_TURNSTILE_ALLOWED_HOSTNAMES: "localhost",
  });
  fs.writeFileSync(dir+"/.dev.vars", Object.entries(v).map(([k,x])=>`${k}="${x}"`).join("\n")+"\n",{mode:0o600});
}
