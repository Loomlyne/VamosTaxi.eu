// Diagnostic only (not a brief step): which URLs answer 401/404 on the signed-out /login, and is there any booking row in the lab.
import { start, open, db, DASH, BASE } from "/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/agent-a27c298ece3746d96/scripts/test-lab/lab-browser.mjs";
await start({ evidenceDir: "/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/agent-a27c298ece3746d96/.planning/quick/261004-ops-asset-gate/evidence/diag" });
const s = await open({ viewport: 1440, name: "diag" });
const bad = [];
s.page.on("response", (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).host}${new URL(r.url()).pathname}`); });
await s.page.goto(DASH + "/login", { waitUntil: "networkidle" });
console.log("login >=400:", JSON.stringify(bad));
const a = await s.page.request.get(DASH + "/photos/site/ops-login-bg.jpg", { maxRedirects: 0 });
const b = await s.page.request.get(BASE + "/photos/site/ops-login-bg.jpg", { maxRedirects: 0 });
console.log("bg image dash", a.status(), "public", b.status());
console.log("bookings count", db("select count(*) from public.bookings"));
// public home: which responses are >=400
const p = await open({ viewport: 1440, name: "diagp" });
const bad2 = [];
p.page.on("response", (r) => { if (r.status() >= 400) bad2.push(`${r.status()} ${new URL(r.url()).host}${new URL(r.url()).pathname}`); });
p.page.on("requestfailed", (r) => bad2.push(`FAILED ${r.url().slice(0, 100)} ${r.failure()?.errorText}`));
await p.page.goto(BASE + "/", { waitUntil: "networkidle" });
console.log("public home >=400:", JSON.stringify(bad2));
process.exit(0);
