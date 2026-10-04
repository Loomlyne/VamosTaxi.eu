import { start, open, dashboardSignIn, DASH } from "/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/agent-ad892723ff45e1689/scripts/test-lab/lab-browser.mjs";
await start({ evidenceDir: new URL(".", import.meta.url).pathname });
const d = await open({ viewport: 1440, name: "probe" });
await dashboardSignIn(d);
await d.page.goto(DASH + "/bookings", { waitUntil: "networkidle" });
const links = await d.page.evaluate(() => [...document.querySelectorAll("a,button")].map((e) => (e.innerText || "").trim().replace(/\s+/g, " ") + " -> " + (e.getAttribute("href") || "")).filter((t) => t.length > 4));
console.log(links.join("\n"));
await d.shot("dash-home");
process.exit(0);
