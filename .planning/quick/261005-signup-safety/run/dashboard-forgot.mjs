// Lab proof for the review follow-up "forgot-password on the dashboard host mails staff only" (2026-10-05).
// Real Worker built from this branch, real local Supabase with migration 20261007330000, mail read from the
// Worker log (wrangler's local EMAIL binding). Local only, no live site.
//   WEB_DIR=<apps/web> LAB_BASE=http://localhost:4710 LAB_DASH=http://dashboard.localhost:4711 \
//   LAB_STATE=<lab state dir> node dashboard-forgot.mjs <evidenceDir>
import fs from "node:fs";

const need = (k) => { if (!process.env[k]) throw new Error(`${k} is not set`); return process.env[k]; };
const BASE = need("LAB_BASE"), DASH = need("LAB_DASH"), STATE = need("LAB_STATE");
const [, , EVIDENCE] = process.argv;
fs.mkdirSync(EVIDENCE, { recursive: true });
const run = Date.now().toString(36);
const results = [];
const STAFF = "lab-admin@vamos.local"; // the lab's seeded active admin
const CUSTOMER = `s5-dashforgot-${run}@example.test`;
const UNKNOWN = `s5-nobody-${run}@example.test`;
let ipN = 1;
const ip = () => `10.55.${ipN++ % 250}.${Math.floor(Math.random() * 250)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const mails = () => {
  const log = fs.readFileSync(`${STATE}/logs/public.log`, "utf8").replace(/\x1b\[[0-9;]*m/g, "");
  return [...log.matchAll(/To: (\S+)\nSubject: ([^\n]*)\n/g)].map((m) => ({ to: m[1], subject: m[2] }));
};
const countTo = (to, re) => mails().filter((m) => m.to === to && (!re || re.test(m.subject))).length;

async function post(host, body) {
  const t0 = Date.now();
  const res = await fetch(host + "/api/auth", {
    method: "POST",
    headers: { "content-type": "application/json", origin: host, "cf-connecting-ip": ip() },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, json, ms: Date.now() - t0, cookies: res.headers.getSetCookie().length };
}
const record = (status, name, detail = "") => { results.push({ status, name, detail }); console.log(`${status} | ${name}${detail ? " | " + detail : ""}`); };
async function step(name, fn) {
  try { record("PASS", name, (await fn()) || ""); } catch (e) { record("FAIL", name, String(e && e.message ? e.message : e)); }
}
const ok = (c, m) => { if (!c) throw new Error(m); };

// A customer account the public site made (the lab's Turnstile stand-in accepts any non-empty token but "fail").
await step("setup: a customer account exists for the test address", async () => {
  const r = await post(BASE, { mode: "signup", method: "password", email: CUSTOMER, password: "correct-horse-9", firstName: "Dash", lastName: "Forgot", consent: true, turnstileToken: "t-setup" });
  ok(r.status === 200, `sign-up answered ${r.status}`);
  await sleep(2500);
});

let base = 0;
await step("control: the same customer address asking on the PUBLIC host still gets its recovery mail (unchanged)", async () => {
  base = mails().length;
  const r = await post(BASE, { mode: "forgot", email: CUSTOMER, turnstileToken: "t-pub" });
  ok(r.status === 200 && r.json.stage === "sent", `answer ${r.status} ${JSON.stringify(r.json)}`);
  await sleep(3000);
  const got = mails().slice(base).filter((m) => m.to === CUSTOMER);
  ok(got.length === 1, `expected 1 mail on the public host, got ${got.length}`);
  return "subject: " + got[0].subject;
});

let staffRes, custRes, unkRes;
await step("dashboard host: an active staff address gets the recovery mail", async () => {
  base = mails().length;
  staffRes = await post(DASH, { mode: "forgot", email: STAFF });
  ok(staffRes.status === 200 && staffRes.json.stage === "sent", `answer ${staffRes.status} ${JSON.stringify(staffRes.json)}`);
  await sleep(3000);
  const got = mails().slice(base).filter((m) => m.to === STAFF);
  ok(got.length === 1, `expected 1 mail to staff, got ${got.length}`);
  return "subject: " + got[0].subject;
});

await step("dashboard host: a customer address gets NO mail, and the answer is the same neutral 'sent'", async () => {
  base = mails().length;
  custRes = await post(DASH, { mode: "forgot", email: CUSTOMER });
  ok(custRes.status === 200 && JSON.stringify(custRes.json) === JSON.stringify({ stage: "sent" }), `answer ${custRes.status} ${JSON.stringify(custRes.json)}`);
  await sleep(4000);
  const got = mails().slice(base).filter((m) => m.to === CUSTOMER);
  ok(got.length === 0, `a mail went to the customer address (${got.length})`);
});

await step("dashboard host: an unknown address gets nothing, same answer", async () => {
  base = mails().length;
  unkRes = await post(DASH, { mode: "forgot", email: UNKNOWN });
  ok(unkRes.status === 200 && JSON.stringify(unkRes.json) === JSON.stringify({ stage: "sent" }), `answer ${unkRes.status} ${JSON.stringify(unkRes.json)}`);
  await sleep(2000);
  ok(mails().slice(base).filter((m) => m.to === UNKNOWN).length === 0, "a mail went to the unknown address");
});

await step("dashboard host: staff, customer and unknown answers look the same (status, body, cookies) and none returns before the floor", async () => {
  const all = { staff: staffRes, customer: custRes, unknown: unkRes };
  for (const [k, r] of Object.entries(all)) ok(r.ms >= 1150, `${k} answered after only ${r.ms} ms`);
  ok(staffRes.cookies === custRes.cookies, `Set-Cookie count differs: staff ${staffRes.cookies}, customer ${custRes.cookies}`);
  return `ms staff ${staffRes.ms}, customer ${custRes.ms}, unknown ${unkRes.ms}; set-cookie staff ${staffRes.cookies}, customer ${custRes.cookies}, unknown ${unkRes.cookies}`;
});

await step("dashboard host: password sign-in is untouched (the form still answers as before)", async () => {
  const r = await post(DASH, { mode: "signin", method: "password", email: "nobody@example.test", password: "wrong-password-1" });
  ok(r.status === 200 && r.json.banner === "credentials", `answer ${r.status} ${JSON.stringify(r.json)}`);
});

fs.writeFileSync(`${EVIDENCE}/dashboard-forgot.json`, JSON.stringify({ at: new Date().toISOString(), results }, null, 1));
const fails = results.filter((r) => r.status === "FAIL").length;
console.log(`${results.length - fails} pass, ${fails} fail`);
process.exit(fails ? 1 : 0);
