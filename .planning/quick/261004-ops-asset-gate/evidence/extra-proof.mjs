// Extra steps X2 and X3 from the lead. Run with the gate lab variables. Evidence goes to evidence/extra.
import fs from "node:fs";
import { start, finish, open, dashboardSignIn, step, db, DASH } from "/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/agent-a27c298ece3746d96/scripts/test-lab/lab-browser.mjs";

const EV = "/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/agent-a27c298ece3746d96/.planning/quick/261004-ops-asset-gate/evidence/extra";
await start({ evidenceDir: EV });
const full = {};

function track(s) {
  const t = { ops: [], bad: [], failed: [], cerr: [], perr: [] };
  s.page.on("console", (m) => { if (m.type() === "error") t.cerr.push(`${m.text().replace(/\s+/g, " ").slice(0, 150)} @ ${m.location()?.url ? new URL(m.location().url).host + new URL(m.location().url).pathname : "(no url)"}`); });
  s.page.on("pageerror", (e) => t.perr.push(String(e).replace(/\s+/g, " ").slice(0, 150)));
  s.page.on("requestfailed", (r) => t.failed.push(`FAILED ${r.method()} ${new URL(r.url()).host}${new URL(r.url()).pathname} ${r.failure()?.errorText}`));
  s.page.on("response", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/app/ops")) t.ops.push(`${u.pathname} ${r.status()}`);
    if (r.status() >= 400) t.bad.push(`${r.status()} ${r.request().method()} ${u.host}${u.pathname}`);
  });
  s.t = t; return t;
}
const reset = (t) => { for (const k of Object.keys(t)) t[k].length = 0; };
const snap = (t) => ({ ops: [...t.ops], count: t.ops.length, bad: [...t.bad], failed: [...t.failed], cerr: [...t.cerr], perr: [...t.perr] });
const show = (id, o) => console.log(`  [${id}] /app/ops (${o.count}): ${o.ops.join(" | ")}\n  [${id}] >=400: ${o.bad.join(" | ") || "none"}\n  [${id}] requestfailed: ${o.failed.join(" | ") || "none"}\n  [${id}] console errors ${o.cerr.length}: ${o.cerr.join(" || ") || "none"}; page errors ${o.perr.length}: ${o.perr.join(" || ") || "none"}`);
const photoStub = (page) => page.route("**/photos/**", (r) => r.fulfill({ status: 200, contentType: "image/jpeg", body: Buffer.alloc(0) }));

// ---------- X2 ----------
const reference = db("select reference from public.bookings order by created_at desc limit 1");
console.log(`X1 db: reference "${reference}"; bookings ${db("select count(*) from public.bookings")}`);
if (!reference) { console.log("BLOCKED | X2 | no booking row after X1"); await finish(); }

const s = await open({ viewport: 1440, name: "x2" });
const t = track(s);
await step("X2", "booking detail after sign-in", async () => {
  reset(t);
  await dashboardSignIn(s);
  await s.page.waitForLoadState("networkidle").catch(() => {});
  const signIn = snap(t); full.X2_signin = signIn; show("X2 sign-in window", signIn);
  reset(t);
  const resp = await s.page.goto(DASH + "/bookings/" + reference, { waitUntil: "networkidle" });
  await s.page.waitForTimeout(2500);
  const txt = (await s.page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  const shows = txt.includes(reference);
  const detail = snap(t); full.X2_detail = detail; show("X2 detail window", detail);
  const allOps = [...signIn.ops, ...detail.ops];
  return { s, ok: resp.status() === 200 && shows && allOps.every((o) => o.endsWith(" 200")),
    evidence: `reference ${reference}; page ${resp.status()}; shows reference ${shows}; url ${new URL(s.page.url()).pathname}; /app/ops in detail window ${detail.count} (${detail.ops.join(", ")}); sign-in window ${signIn.count}; all /app/ops 200 ${allOps.every((o) => o.endsWith(" 200"))}; console errors detail ${detail.cerr.length}, sign-in ${signIn.cerr.length}` };
}, { shot: true });
await s.ctx.close();

// ---------- X3a: G1 again, photos stubbed ----------
const a = await open({ viewport: 1440, name: "x3g1" });
await photoStub(a.page);
const ta = track(a);
await step("X3-G1", "signed-out /login, photos stubbed", async () => {
  reset(ta);
  const resp = await a.page.goto(DASH + "/login", { waitUntil: "networkidle" });
  await a.page.waitForTimeout(1500);
  const o = snap(ta); full.X3_G1 = o; show("X3-G1", o);
  const only401 = o.bad.length === 1 && /^401 GET .*\/api\/staff\/me$/.test(o.bad[0]);
  return { s: a, ok: resp.status() === 200 && only401 && o.ops.every((x) => x.endsWith(" 200")),
    evidence: `login ${resp.status()}; >=400: ${o.bad.join(" | ") || "none"}; console errors ${o.cerr.length}: ${o.cerr.join(" || ")}; /app/ops (${o.count}): ${o.ops.join(", ")}` };
}, { shot: true });
await a.ctx.close();

// ---------- X3b: G10 again, photos stubbed ----------
const m = await open({ viewport: 390, name: "x3g10" });
await photoStub(m.page);
const tm = track(m);
await step("X3-G10", "390 px login + sign-in + dashboard, photos stubbed", async () => {
  reset(tm);
  await m.page.goto(DASH + "/login", { waitUntil: "networkidle" });
  const login = snap(tm); full.X3_G10_login = login; show("X3-G10 login", login);
  await dashboardSignIn(m);
  await m.page.waitForLoadState("networkidle").catch(() => {});
  await m.page.waitForTimeout(2000);
  const o = snap(tm); full.X3_G10_total = o; show("X3-G10 total", o);
  const url = new URL(m.page.url());
  const bad401 = o.bad.every((x) => /^401 GET .*\/api\/staff\/me$/.test(x));
  return { s: m, ok: !/\/login/.test(url.pathname) && bad401 && o.ops.every((x) => x.endsWith(" 200")),
    evidence: `url ${url.pathname}; >=400: ${o.bad.join(" | ") || "none"}; console errors ${o.cerr.length}: ${o.cerr.join(" || ")}; /app/ops (${o.count}): ${o.ops.join(", ")}` };
}, { shot: true });
await m.ctx.close();

fs.writeFileSync(`${EV}/extra-responses.json`, JSON.stringify(full, null, 1));
await finish();
