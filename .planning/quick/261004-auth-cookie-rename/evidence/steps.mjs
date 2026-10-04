import { start, finish, open, dismissCookies, dashboardSignIn, BASE, DASH, step } from "/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/agent-ad892723ff45e1689/scripts/test-lab/lab-browser.mjs";
const ev = new URL(".", import.meta.url).pathname;
await start({ evidenceDir: ev });
const OLD = ["sb-yaumjzvylngfjhtuffqs-auth-token.0","sb-yaumjzvylngfjhtuffqs-auth-token.1","sb-yaumjzvylngfjhtuffqs-auth-token-code-verifier"];
const plant = (s, host) => s.ctx.addCookies(OLD.map((name) => ({ name, value: "old", domain: host, path: "/" })));
const names = async (s) => (await s.ctx.cookies()).map((c) => c.name);
const sess = async (s) => (await (await s.page.request.get(BASE + "/api/auth/session")).json());
const hasSb = (n) => n.filter((x) => x.startsWith("sb-"));
const vt = async (s) => (await s.ctx.cookies()).filter((c) => /^vt-auth(\.\d+)?$/.test(c.name) && c.value);
const EMAIL = "cookie-lab@example.com", PW = "Lab-cookie-2026!";

const a = await open({ viewport: 1440, name: "cust" });
await step("C1", "old cookies cleared on home", async () => {
  await plant(a, "localhost");
  const r = await a.page.goto(BASE + "/", { waitUntil: "networkidle" });
  const n = await names(a), j = await sess(a);
  return { s: a, ok: r.status() === 200 && a.errors.length === 0 && hasSb(n).length === 0 && j.signedIn === false, evidence: `status ${r.status()}; errors ${a.errors.length}; sb- left ${hasSb(n).length}; signedIn ${j.signedIn}; names [${n}]` };
});
await step("C2", "customer password sign-in", async () => {
  await a.page.goto(BASE + "/sign-in", { waitUntil: "networkidle" });
  await dismissCookies(a.page);
  await a.shot("C2-before");
  const pw = a.page.locator('input[type="password"]').first();
  if (!(await pw.isVisible().catch(() => false))) await a.page.getByText(/password/i).first().click().catch(() => {});
  await a.page.locator('input[type="email"], input[autocomplete="email"], input[autocomplete="username"]').first().fill(EMAIL);
  await pw.fill(PW);
  await a.page.getByRole("button", { name: /^\s*sign in\s*$/i }).first().click();
  await a.page.waitForTimeout(4000);
  const finishStep = (await a.page.getByText(/finish your account/i).count()) > 0;
  if (finishStep) {
    await a.shot("C2-finish");
    for (const cb of await a.page.locator('input[type="checkbox"]').all()) await cb.check().catch(() => {});
    for (const i of await a.page.locator('input[type="text"]:visible').all()) if (!(await i.inputValue())) await i.fill("Cookie Lab");
    await a.page.getByRole("button", { name: /finish|continue|save/i }).first().click();
    await a.page.waitForTimeout(4000);
  }
  const n = await names(a), j = await sess(a), v = await vt(a);
  return { s: a, ok: !/\/sign-in/.test(a.page.url()) && j.signedIn === true && v.length > 0 && hasSb(n).length === 0 && !n.some((x) => x.includes("yaumjzvylngfjhtuffqs")), evidence: `url ${new URL(a.page.url()).pathname}; finishStep ${finishStep}; signedIn ${j.signedIn}; vt cookies ${v.map((c) => c.name)}; sb- ${hasSb(n).length}; names [${n}]` };
});
await step("C3", "/account shows email", async () => {
  const r = await a.page.goto(BASE + "/account", { waitUntil: "networkidle" });
  const t = await a.page.evaluate(() => document.body.innerText + [...document.querySelectorAll("input")].map((i) => i.value).join(" "));
  return { s: a, ok: r.status() === 200 && !a.errors.length && t.includes(EMAIL), evidence: `status ${r.status()}; errors ${a.errors.length}; email shown ${t.includes(EMAIL)}` };
}, { shot: true });
await step("C4", "old cookies re-planted while signed in", async () => {
  await plant(a, "localhost");
  const r = await a.page.goto(BASE + "/account", { waitUntil: "networkidle" });
  const n = await names(a), j = await sess(a), v = await vt(a);
  return { s: a, ok: j.signedIn === true && v.length > 0 && hasSb(n).length === 0, evidence: `status ${r.status()}; signedIn ${j.signedIn}; vt ${v.map((c) => c.name)}; sb- ${hasSb(n).length}` };
});
await step("C5", "sign out via site", async () => {
  await a.page.goto(BASE + "/account", { waitUntil: "networkidle" });
  const ctl = a.page.locator('button, a').filter({ hasText: /sign out|log out/i }).first();
  const found = (await ctl.count()) > 0;
  if (found) { await ctl.click({ timeout: 5000 }).catch(() => {}); await a.page.waitForTimeout(3000); }
  const j = await sess(a), v = await vt(a);
  return { s: a, ok: found && j.signedIn === false && v.length === 0, evidence: `control found ${found}; signedIn ${j.signedIn}; non-empty vt cookies ${v.length}; url ${new URL(a.page.url()).pathname}` };
});
await a.ctx.close();

const m = await open({ viewport: 390, name: "m390" });
await step("C6", "phone: old cookies, /account", async () => {
  await plant(m, "localhost");
  const r = await m.page.goto(BASE + "/account", { waitUntil: "networkidle" });
  const n = await names(m), j = await sess(m);
  return { s: m, ok: r.status() < 400 && hasSb(n).length === 0 && j.signedIn === false, evidence: `status ${r.status()}; url ${new URL(m.page.url()).pathname}; sb- ${hasSb(n).length}; signedIn ${j.signedIn}` };
});
await m.ctx.close();

const d = await open({ viewport: 1440, name: "dash" });
await step("D1", "dashboard login with old cookies", async () => {
  await plant(d, "dashboard.localhost");
  const r = await d.page.goto(DASH + "/login", { waitUntil: "networkidle" });
  const n = await names(d), form = await d.page.locator('input[type="password"]').count();
  return { s: d, ok: r.status() === 200 && form > 0 && !d.errors.length && hasSb(n).length === 0, evidence: `status ${r.status()}; password field ${form}; errors ${d.errors.length}; sb- ${hasSb(n).length}` };
});
await step("D2", "dashboard sign-in", async () => {
  await dashboardSignIn(d);
  const mfa = (await d.page.getByText(/authenticator|6-digit|verification code/i).count()) > 0;
  const c = await d.ctx.cookies(); const n = c.map((x) => x.name);
  const v = c.filter((x) => /^vt-auth(\.\d+)?$/.test(x.name) && x.domain.includes("dashboard.localhost"));
  return { s: d, ok: v.length > 0 && hasSb(n).length === 0, evidence: `url ${new URL(d.page.url()).pathname}; mfa text ${mfa}; vt ${v.map((x) => x.name + "@" + x.domain)}; sb- ${hasSb(n).length}` };
});
await step("D3", "New trip form", async () => {
  await d.page.goto(DASH + "/bookings", { waitUntil: "networkidle" }); const link = d.page.locator("a, button").filter({ hasText: /new (trip|booking)/i }).first();
  if (await link.count()) { await link.click().catch(() => {}); await d.page.waitForLoadState("networkidle").catch(() => {}); }
  else await d.page.goto(DASH + "/new-trip", { waitUntil: "networkidle" });
  await d.page.waitForTimeout(2000);
  const from = await d.page.locator('input[placeholder*="rom" i], input[aria-label*="rom" i], input[placeholder*="ickup" i], input[aria-label*="ickup" i]').count();
  return { s: d, ok: from > 0 && !d.errors.length, evidence: `url ${new URL(d.page.url()).pathname}; From/pickup inputs ${from}; errors ${d.errors.length}` };
}, { shot: true });
await step("D4", "old cookies re-planted, reload", async () => {
  await plant(d, "dashboard.localhost");
  await d.page.reload({ waitUntil: "networkidle" });
  const n = await names(d);
  return { s: d, ok: !/\/login/.test(d.page.url()) && hasSb(n).length === 0, evidence: `url ${new URL(d.page.url()).pathname}; sb- ${hasSb(n).length}` };
});
await finish();
