import fs from "node:fs";
const dir = process.argv[2];
const strip = s => s.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m,g)=>g||"").replace(/,(\s*[}\]])/g,"$1");
const c = JSON.parse(strip(fs.readFileSync(dir+"/wrangler.jsonc","utf8")));
const e = c.env.staging;
const cfg = { name:"vamos-e2e", main:c.main, compatibility_date:c.compatibility_date, compatibility_flags:c.compatibility_flags,
  assets:c.assets, vars:e.vars, kv_namespaces:e.kv_namespaces, r2_buckets:e.r2_buckets,
  queues:{producers:e.queues.producers}, ratelimits:e.ratelimits, analytics_engine_datasets:e.analytics_engine_datasets,
  send_email:e.send_email,
  hyperdrive:[{binding:"HYPERDRIVE",id:"00000000000000000000000000000001",localConnectionString:"postgres://vamos_public:vamos_public@127.0.0.1:57322/postgres"},
              {binding:"HYPERDRIVE_NOCACHE",id:"00000000000000000000000000000002",localConnectionString:"postgres://vamos_edge:vamos_edge@127.0.0.1:57322/postgres"}]};
fs.writeFileSync(dir+"/wrangler.e2e.jsonc", JSON.stringify(cfg,null,1));
// dev vars
const env = Object.fromEntries(fs.readFileSync(process.argv[3],"utf8").split("\n").filter(Boolean).map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1).replace(/^"|"$/g,"")]}));
const secret = fs.readFileSync(process.argv[4],"utf8").trim();
const v = {SUPABASE_URL:"http://127.0.0.1:57321",SUPABASE_ANON_KEY:env.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:env.SERVICE_ROLE_KEY,SEND_EMAIL_HOOK_SECRET:secret,STAFF_REAUTH_SECRET:"e2e-local-reauth-secret-0123456789abcdef"};
fs.writeFileSync(dir+"/.dev.vars", Object.entries(v).map(([k,x])=>`${k}="${x}"`).join("\n")+"\n",{mode:0o600});
