// Step script for TEST-BRIEF 261004-ops-asset-gate. Run: eval "$(scripts/test-lab/lab.sh env gate)" && node <this file>
import fs from "node:fs";
import { start, finish, open, dashboardSignIn, step, db, BASE, DASH } from "/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/agent-a27c298ece3746d96/scripts/test-lab/lab-browser.mjs";

const EV = "/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/agent-a27c298ece3746d96/.planning/quick/261004-ops-asset-gate/evidence";
await start({ evidenceDir: EV });
const full = {}; // full lists per step, written to ops-responses.json

function track(s) {
  const t = { ops: [], cerr: [], perr: [], r404: [] };
  s.page.on("console", (m) => { if (m.type() === "error") t.cerr.push(m.text().replace(/\s+/g, " ").slice(0, 150)); });
  s.page.on("pageerror", (e) => t.perr.push(String(e).replace(/\s+/g, " ").slice(0, 150)));
  s.page.on("response", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/app/ops")) t.ops.push({ path: u.pathname, status: r.status() });
    if (r.status() === 404) t.r404.push(`${u.host}${u.pathname}`);
  });
  s.t = t; return t;
}
const reset = (t) => { t.ops.length = 0; t.cerr.length = 0; t.perr.length = 0; t.r404.length = 0; };
const opsList = (t) => t.ops.map((o) => `${o.path} ${o.status}`);
const keep = (id, t) => { full[id] = { ops: opsList(t), count: t.ops.length, consoleErrors: [...t.cerr], pageErrors: [...t.perr], r404: [...t.r404] }; console.log(`  [${id}] /app/ops responses (${t.ops.length}): ${opsList(t).join(" | ")}`); console.log(`  [${id}] console errors ${t.cerr.length}: ${t.cerr.join(" || ")}; page errors ${t.perr.length}: ${t.perr.join(" || ")}; 404 responses: ${t.r404.join(" | ") || "none"}`); };
const errCount = (t) => t.cerr.length + t.perr.length;

const PATHS = ["/app/ops/ops.dc.html", "/app/ops/ops-login.dc.html", "/app/ops/ops.html", "/app/ops/OpsDetail.dc.html", "/app/ops/OpsBoard.dc.html", "/app/ops/OpsSettings.dc.html", "/app/ops/OpsSidebar.dc.html", "/app/ops/OpsTable.dc.html"];
async function probe(page, base, paths, headers) {
  const out = [];
  for (const p of paths) {
    const r = await page.request.get(base + p, { maxRedirects: 0, ...(headers ? { headers } : {}) });
    const body = await r.body();
    out.push({ p, status: r.status(), len: body.length, cc: r.headers()["cache-control"] ?? null, loc: r.headers()["location"] ?? null });
  }
  return out;
}
const sum = (rs) => rs.map((r) => `${r.p.split("/").pop()}:${r.status}/${r.len}b/${r.cc}`).join("; ");

// ---------- G1-G9: one browser, signed out -> in -> out ----------
const s = await open({ viewport: 1440, name: "gate" });
const t = track(s);

await step("G1", "signed out /login", async () => {
  reset(t);
  const resp = await s.page.goto(DASH + "/login", { waitUntil: "networkidle" });
  const email = await s.page.locator('input[type="email"], input[autocomplete="email"], input[autocomplete="username"]').first().isVisible();
  const pass = await s.page.locator('input[type="password"]').first().isVisible();
  keep("G1", t);
  const paths = t.ops.map((o) => o.path).sort(), want = ["/app/ops/AuthForm.dc.html", "/app/ops/support.js"];
  const uniq = [...new Set(paths)];
  const exact = JSON.stringify(uniq) === JSON.stringify(want) && t.ops.every((o) => o.status === 200);
  return { s, ok: resp.status() === 200 && email && pass && errCount(t) === 0 && exact && t.r404.length === 0,
    evidence: `login ${resp.status()}; email ${email}, password ${pass}; errors ${errCount(t)}; /app/ops (${t.ops.length}): ${opsList(t).join(", ")}; 404s ${t.r404.length}` };
}, { shot: true });

await step("G2", "signed out: screen files 404", async () => {
  const rs = await probe(s.page, DASH, PATHS);
  full.G2 = rs;
  return { ok: rs.every((r) => r.status === 404 && r.len === 0 && r.cc === "private, no-store"), evidence: sum(rs) };
});

await step("G3", "signed out: the two open files", async () => {
  const rs = await probe(s.page, DASH, ["/app/ops/support.js", "/app/ops/AuthForm.dc.html"]);
  full.G3 = rs;
  return { ok: rs.every((r) => r.status === 200 && r.len > 0), evidence: sum(rs) };
});

await step("G4", "signed out + x-vamos-dc-asset header", async () => {
  const rs = await probe(s.page, DASH, PATHS, { "x-vamos-dc-asset": "1" });
  full.G4 = rs;
  return { ok: rs.every((r) => r.status === 404), evidence: sum(rs) };
});

await step("G5", "dashboardSignIn", async () => {
  reset(t);
  await dashboardSignIn(s);
  await s.page.waitForLoadState("networkidle").catch(() => {});
  await s.page.waitForTimeout(1500);
  const url = new URL(s.page.url());
  const nav = (await s.page.locator("nav, aside").allInnerTexts()).join(" ").replace(/\s+/g, " ");
  const side = /dashboard|trips/i.test(nav);
  const controls = await s.page.evaluate(() => [...document.querySelectorAll("button, a, [role=menuitem]")].map((e) => ({ tag: e.tagName, text: (e.innerText || "").trim().replace(/\s+/g, " ").slice(0, 40), aria: e.getAttribute("aria-label") })).filter((c) => c.text || c.aria));
  fs.writeFileSync(`${EV}/g5-controls.json`, JSON.stringify({ nav: nav.slice(0, 500), controls }, null, 1));
  keep("G5", t);
  return { s, ok: !/\/login/.test(url.pathname) && side && errCount(t) === 0 && t.ops.length > 0 && t.ops.every((o) => o.status === 200),
    evidence: `url ${url.pathname}; sidebar text seen ${side}; errors ${errCount(t)}; /app/ops count ${t.ops.length}, all 200: ${t.ops.every((o) => o.status === 200)}: ${[...new Set(opsList(t))].join(", ")}` };
}, { shot: true });

let rows = 0;
await step("G6", "/bookings board", async () => {
  reset(t);
  const resp = await s.page.goto(DASH + "/bookings", { waitUntil: "networkidle" });
  await s.page.waitForTimeout(2000);
  rows = await s.page.locator("table tbody tr, [role=row]").count();
  const txt = (await s.page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  const empty = /no (trips|bookings)|nothing|empty|no results/i.test(txt);
  keep("G6", t);
  return { s, ok: resp.status() === 200 && (rows > 0 || empty) && errCount(t) === 0 && t.ops.length > 0 && t.ops.every((o) => o.status === 200),
    evidence: `page ${resp.status()}; rows ${rows}; empty message ${empty}; errors ${errCount(t)}; /app/ops count ${t.ops.length}, all 200: ${t.ops.every((o) => o.status === 200)}; text: "${txt.slice(0, 100)}"` };
}, { shot: true });

await step("G7", "booking detail", async () => {
  reset(t);
  let how = "";
  const row = s.page.locator("table tbody tr, [role=row]").filter({ hasText: /VT-/ }).first();
  if (rows > 0 && (await row.count()) > 0) {
    await row.click().catch(() => {});
    await s.page.waitForURL(/\/bookings\/VT-/, { timeout: 8000 }).catch(() => {});
    how = "clicked first row";
  }
  if (!/\/bookings\/VT-/.test(s.page.url())) {
    const ref = db("select reference from public.bookings order by created_at desc limit 1");
    how = `${how ? how + " (no navigation); " : "no row; "}db reference ${ref}`;
    await s.page.goto(DASH + "/bookings/" + ref, { waitUntil: "networkidle" });
  }
  await s.page.waitForLoadState("networkidle").catch(() => {});
  await s.page.waitForTimeout(2000);
  const txt = (await s.page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  const ref = /VT-[A-Z0-9-]+/.exec(txt)?.[0];
  keep("G7", t);
  return { s, ok: !!ref && errCount(t) === 0 && t.ops.length > 0 && t.ops.every((o) => o.status === 200),
    evidence: `${how}; url ${new URL(s.page.url()).pathname}; reference shown ${ref}; errors ${errCount(t)}; /app/ops count ${t.ops.length}, all 200: ${t.ops.every((o) => o.status === 200)}` };
}, { shot: true });

await step("G8", "signed in: screen files", async () => {
  const rs = await probe(s.page, DASH, ["/app/ops/OpsDetail.dc.html", "/app/ops/ops.dc.html"]);
  full.G8 = rs;
  return { ok: rs.every((r) => r.status === 200 && r.len > 0 && r.cc === "private, no-store"), evidence: sum(rs) };
});

await step("G9", "sign out", async () => {
  reset(t);
  const rx = /sign[ -]?out|log[ -]?out/i;
  const pick = () => s.page.locator("button, a, [role=menuitem]").filter({ hasText: rx }).first();
  let found = await pick().isVisible().catch(() => false), how = "direct";
  if (!found) { // open a profile / account menu in the sidebar, then look again
    const openers = s.page.locator("aside button, nav button, header button").filter({ hasText: /./ });
    const aria = s.page.locator('[aria-label*="profile" i], [aria-label*="account" i], [aria-label*="user" i], [aria-haspopup]');
    for (const l of [aria, openers]) {
      const n = await l.count();
      for (let i = 0; i < Math.min(n, 12) && !found; i++) {
        await l.nth(i).click({ timeout: 1500 }).catch(() => {});
        await s.page.waitForTimeout(400);
        found = await pick().isVisible().catch(() => false);
        if (found) how = `after opening menu control #${i}`;
      }
      if (found) break;
    }
  }
  if (!found) throw new Error("no visible Sign out / Log out control found (see g5-controls.json)");
  await pick().click();
  await s.page.waitForURL(/\/login(\?.*)?$/, { timeout: 20000 });
  await s.page.waitForLoadState("networkidle").catch(() => {});
  const url = new URL(s.page.url());
  const rs = await probe(s.page, DASH, PATHS);
  full.G9 = rs;
  const cookies = (await s.ctx.cookies()).filter((c) => /^vt-auth(\.\d+)?$/.test(c.name));
  const nonEmpty = cookies.filter((c) => c.value && c.value.length > 0).map((c) => c.name);
  return { s, ok: /\/login$/.test(url.pathname) && rs.every((r) => r.status === 404) && nonEmpty.length === 0,
    evidence: `${how}; url ${url.pathname}${url.search}; signed-out probes ${rs.map((r) => r.status).join(",")}; vt-auth cookies present ${cookies.length} (names ${cookies.map((c) => c.name).join(",") || "none"}), non-empty ${nonEmpty.length}` };
}, { shot: true });
await s.ctx.close();

// ---------- G10: phone ----------
const m = await open({ viewport: 390, name: "m390" });
const tm = track(m);
await step("G10", "390 login + sign-in + dashboard", async () => {
  await m.page.goto(DASH + "/login", { waitUntil: "networkidle" });
  const loginErr = errCount(tm);
  const loginShown = await m.page.locator('input[type="password"]').first().isVisible();
  await dashboardSignIn(m);
  await m.page.waitForLoadState("networkidle").catch(() => {});
  await m.page.waitForTimeout(2000);
  const url = new URL(m.page.url());
  const txt = (await m.page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  keep("G10", tm);
  const non200 = tm.ops.filter((o) => o.status !== 200);
  return { s: m, ok: loginShown && loginErr === 0 && errCount(tm) === 0 && !/\/login/.test(url.pathname) && non200.length === 0 && txt.length > 20,
    evidence: `login visible ${loginShown}, errors at login ${loginErr}; after sign-in url ${url.pathname}; errors total ${errCount(tm)}; /app/ops count ${tm.ops.length}, non-200 ${non200.length}; text "${txt.slice(0, 80)}"` };
}, { shot: true });
await m.ctx.close();

// ---------- P1-P4: public host ----------
const p = await open({ viewport: 1440, name: "pub" });
const tp = track(p);
await step("P1", "public host: dashboard asset files", async () => {
  const rs = await probe(p.page, BASE, ["/app/ops/OpsDetail.dc.html", "/app/ops/support.js", "/app/ops/AuthForm.dc.html"]);
  full.P1 = rs;
  return { ok: rs.every((r) => r.status === 404), evidence: sum(rs) };
});
await step("P2", "public / and /terms", async () => {
  const out = [];
  for (const path of ["/", "/terms"]) {
    reset(tp);
    const r = await p.page.goto(BASE + path, { waitUntil: "networkidle" });
    await p.page.waitForTimeout(1500);
    const h = (await p.page.locator("h1, h2").first().innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 60);
    out.push({ path, status: r.status(), heading: h, perr: tp.perr.length, cerr: tp.cerr.length, cerrText: [...tp.cerr] });
    if (path === "/") await p.shot("P2-home");
  }
  full.P2 = out;
  return { s: p, ok: out.every((o) => o.status === 200 && o.heading && o.perr === 0), evidence: out.map((o) => `${o.path} ${o.status} heading "${o.heading}" page errors ${o.perr} console errors ${o.cerr} ${o.cerrText.join("|")}`).join("; ") };
}, { shot: true });
await step("P3", "public /app/pages/terms.dc.html with and without header", async () => {
  const a = await p.page.request.get(BASE + "/app/pages/terms.dc.html", { maxRedirects: 0, headers: { "sec-fetch-dest": "document", "x-vamos-dc-asset": "1" } });
  const b = await p.page.request.get(BASE + "/app/pages/terms.dc.html", { maxRedirects: 0, headers: { "sec-fetch-dest": "document" } });
  const la = a.headers()["location"] ?? null, lb = b.headers()["location"] ?? null;
  full.P3 = { with: { status: a.status(), location: la }, without: { status: b.status(), location: lb } };
  return { ok: a.status() === b.status() && la === lb && a.status() === 308 && /\/terms$/.test(la ?? ""), evidence: `with header ${a.status()} ${la}; without ${b.status()} ${lb}` };
});
await step("P4", "dashboard /login/confirm", async () => {
  const r = await p.page.request.get(DASH + "/login/confirm");
  const body = await r.text();
  return { ok: r.status() === 200 && body.includes("<html"), evidence: `status ${r.status()}; body ${body.length} chars; contains <html ${body.includes("<html")}` };
});
await p.ctx.close();

fs.writeFileSync(`${EV}/ops-responses.json`, JSON.stringify(full, null, 1));
await finish();
