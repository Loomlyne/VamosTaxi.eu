import { start, open, signIn, S, db, DASH } from "./lib.mjs";
await start({ evidenceDir: process.argv[2] });
const s = await open({ viewport: 1440, name: "s1440" });
await signIn(s);
await S("S8", "Assign picker of the lab-old trip", async () => {
  await s.page.goto(DASH + "/bookings", { waitUntil: "networkidle" }); await s.page.waitForTimeout(1500);
  await s.page.getByText("p30-old@example.test").first().click(); await s.page.waitForTimeout(2500);
  const url = new URL(s.page.url()).pathname;
  const opts = await s.page.evaluate(() => [...document.querySelectorAll("select option")].map((o) => o.textContent.trim()));
  const txt = await s.page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
  const line = /1 chauffeur left out: retired class/.test(txt);
  const no = /No chauffeur has the class/.test(txt);
  const lineEl = await s.page.evaluate(() => { const m = [...document.querySelectorAll("*")].filter((e) => /left out: retired class/.test(e.innerText || "")); const e = m.filter((x) => !m.some((o) => o !== x && x.contains(o)))[0]; return e ? { tag: e.tagName, color: getComputedStyle(e).color, size: getComputedStyle(e).fontSize } : null; });
  await s.shot("S8-detail");
  const ok = opts.length === 1 && /choose/i.test(opts[0]) && !opts.some((o) => /Lab Old Driver/.test(o)) && line && !no;
  return { s, ok, evidence: `${url}; picker options ${JSON.stringify(opts)}; "1 chauffeur left out: retired class" shown: ${line} (${JSON.stringify(lineEl)}); "No chauffeur has the class" shown: ${no}` };
}, { s });
// explore actions menu
await s.page.getByRole("button", { name: /^actions$/i }).click(); await s.page.waitForTimeout(800);
console.log("MENU:", (await s.page.evaluate(() => [...document.querySelectorAll('[role=menu] *, [role=menuitem]')].map(e=>e.innerText).filter(Boolean).join(" | "))).slice(0, 600));
process.exit(0);
