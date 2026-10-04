import { start, open, BASE } from "/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/agent-acc772106f447cb8c/scripts/test-lab/lab-browser.mjs";
const EV = "/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/agent-acc772106f447cb8c/.planning/quick/261004-hide-internal-ids/evidence/lab";
await start({ evidenceDir: EV });
const c = await open({ viewport: 1440, name: "d" });
c.page.on("requestfailed", (r) => console.log("FAILED", r.url().slice(0, 140), r.failure()?.errorText));
c.page.on("response", (r) => { if (r.status() >= 400) console.log(r.status(), r.url().slice(0, 140)); });
c.page.on("pageerror", (e) => console.log("PAGEERR", String(e).slice(0, 150)));
for (const p of ["/cookies", "/"]) { console.log("==", p); await c.page.goto(BASE + p, { waitUntil: "load" }); await c.page.waitForTimeout(3000); }
process.exit(0);
