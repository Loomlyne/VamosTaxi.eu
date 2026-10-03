// Quick 261003 quote-guards-live: the dashboard New trip (OpsNewTrip.dc.html) has no challenge widget, so a
// signed-in staff session on the dashboard host must never get turnstile_required; anyone else still does.
//   worker.sh start with DASH=1 QS=0 TS_SECRET=pass; then (lab env) node dash-exempt.mjs <evidenceDir>
// Quotes are POSTed from inside the page (same origin, the session's own cookies), with no token, as OpsNewTrip does.
import { start, finish, open, dashboardSignIn, step, DASH } from "../../../../scripts/test-lab/lab-browser.mjs";

await start({ evidenceDir: process.argv[2] ?? `${process.env.LAB_STATE}/evidence-dash` });
const body = {
  locale: "en", display_currency: "CHF", mode: "one_way",
  pickup: { kind: "coords", lng: 8.5492, lat: 47.4582, text: "Zurich Airport" },
  dropoff: { kind: "coords", lng: 8.5152, lat: 47.1737, text: "Zug station" },
  legs: [{ leg_seq: 1, scheduled_local: "2026-12-01T10:30" }], pax: 2, bags: 1,
};
const post = (page, n) => page.evaluate(async ({ b, n }) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = await fetch("/api/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
    const j = await r.json().catch(() => ({}));
    out.push(`${r.status}:${j.ok ? "priced" : j.error ?? j.code ?? "?"}`);
  }
  return out;
}, { b: body, n });
let ipN = 1;
async function ctx(name) {
  const s = await open({ viewport: 1440, name });
  const ip = `10.81.${ipN++}.${1 + Math.floor(Math.random() * 250)}`;
  await s.ctx.setExtraHTTPHeaders({});
  const host = new URL(DASH).host;
  await s.ctx.route((u) => u.host === host, (r) => r.continue({ headers: { ...r.request().headers(), "cf-connecting-ip": ip } }));
  return s;
}

const staff = await ctx("staff");
await step("D-1", "signed-in owner on the dashboard host: 4 quotes, none is turnstile_required", async () => {
  await dashboardSignIn(staff);
  const r = await post(staff.page, 4);
  return { s: staff, ok: r.length === 4 && !r.some((x) => /turnstile_required/.test(x)), evidence: r.join(" ") };
}, { shot: true });

const anon = await ctx("anon");
await step("D-2", "no staff session on the dashboard host: the 3rd quote is turnstile_required", async () => {
  await anon.page.goto(DASH + "/login", { waitUntil: "load" });
  const r = await post(anon.page, 3);
  return { s: anon, ok: /turnstile_required/.test(r[2] ?? "") && !/turnstile_required/.test(r[0] + r[1]), evidence: r.join(" ") };
});
await finish();
