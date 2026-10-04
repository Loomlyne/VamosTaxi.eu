// /cookies "Sign-in" row after ship-order step 2: technical name reads vt-auth, no sb-…-auth-token,
// en and ar at 390 and 1440, no sideways scroll, Arabic RTL, VamosLocale.coverage of the table empty.
// Serves apps/web/public itself (node http, port PORT), Chromium via playwright-core.
//   node scripts/sync-dc-mock-to-public.mjs
//   PW=<playwright-core index.mjs> CHROME=<chromium binary> node cookies-row-check.mjs <repoRoot> <evidenceDir>
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const { chromium } = await import(process.env.PW);
const [root, dir] = process.argv.slice(2);
const pub = path.join(root, "apps/web/public");
fs.mkdirSync(dir, { recursive: true });
const PORT = Number(process.env.PORT ?? 4893);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".woff": "font/woff", ".otf": "font/otf", ".ttf": "font/ttf", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, "http://x").pathname);
  // Static stand-in for the consent API: "already chosen, necessary only", so the banner stays closed.
  if (u === "/api/consent/state") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ ok: true, chosen: true, choice: { functional: false, analytics: false, marketing: false } }));
  }
  if (u.startsWith("/api/")) { res.writeHead(200, { "content-type": "application/json" }); return res.end('{"ok":true}'); }
  const f = path.join(pub, u);
  if (!f.startsWith(pub) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(f)] ?? "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
const b = await chromium.launch({ executablePath: process.env.CHROME, chromiumSandbox: false });
const results = [];
let fail = 0;
for (const vp of [390, 1440]) {
  for (const lang of ["en", "ar"]) {
    const ctx = await b.newContext({ viewport: { width: vp, height: vp === 390 ? 844 : 900 } });
    await ctx.addInitScript((l) => { try { localStorage.setItem("vamosLang", l); } catch (e) {} }, lang);
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}/app/pages/cookies.html`, { waitUntil: "load", timeout: 60000 });
    await p.locator("#necessary tr", { hasText: "vt-auth" }).waitFor({ state: "attached", timeout: 45000 });
    await p.waitForFunction(() => window.VamosLocale && typeof window.VamosLocale.coverage === "function", null, { timeout: 30000 });
    await p.waitForTimeout(2500);
    await p.locator("button", { hasText: /necessary only|الضرورية فقط/i }).first().click({ timeout: 4000 }).catch(() => {});
    await p.waitForTimeout(800);
    const row = p.locator("#necessary tr", { hasText: "vt-auth" });
    const visible = await row.isVisible();
    const tech = await row.locator("[data-ck-tech]").innerText();
    const techDir = await row.locator("[data-ck-tech]").evaluate((el) => getComputedStyle(el).direction);
    const text = (await row.innerText()).replace(/\s+/g, " ");
    const body = await p.evaluate(() => document.body.innerText);
    const cov = await p.evaluate(() => window.VamosLocale.coverage(document.querySelector("#necessary")));
    const dirAttr = await p.evaluate(() => document.documentElement.dir);
    const sideways = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (visible) { await row.scrollIntoViewIfNeeded(); await row.screenshot({ path: `${dir}/cookies-signin-row-${lang}-${vp}.png` }); }
    await p.screenshot({ path: `${dir}/cookies-page-${lang}-${vp}.png` });
    const ok = visible && tech.trim() === "vt-auth" && techDir === "ltr" && !body.includes("auth-token") && cov.count === 0 && !sideways && (lang !== "ar" || dirAttr === "rtl");
    if (!ok) fail++;
    const line = `${ok ? "PASS" : "FAIL"} | ${lang} ${vp} | tech "${tech.trim()}" (${techDir}) | row "${text.slice(0, 140)}" | auth-token on page ${body.includes("auth-token")} | coverage ${cov.count} | dir ${dirAttr} | sideways ${sideways}`;
    results.push(line); console.log(line);
    await ctx.close();
  }
}
fs.writeFileSync(`${dir}/cookies-row-results.txt`, results.join("\n") + "\n");
await b.close();
server.close();
process.exit(fail ? 1 : 0);
