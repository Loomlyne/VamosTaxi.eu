import { start, open, signIn, S, db, DASH } from "./lib.mjs";
await start({ evidenceDir: process.argv[2] });
const s = await open({ viewport: 1440, name: "s1440" });
await signIn(s);
await S("S7", "Chauffeurs screen", async () => {
  await s.page.goto(DASH + "/chauffeurs", { waitUntil: "networkidle" }); await s.page.waitForTimeout(2000);
  const info = await s.page.evaluate(() => {
    const txt = document.body.innerText.replace(/\s+/g, " ");
    const rows = [...document.querySelectorAll("tr")].map((r) => r.innerText.replace(/\s+/g, " ").trim()).filter((t) => /Lab (Eco|Biz|Old) Driver/.test(t));
    const flag = (() => { const m = [...document.querySelectorAll("tr *")].filter((e) => /Retired class: pick a new one/.test(e.innerText || "")); const inner = m.filter((e) => !m.some((o) => o !== e && e.contains(o))); return inner.map((e) => ({ t: e.innerText, tag: e.tagName, color: getComputedStyle(e).color })); })();
    return { txt, rows, flag };
  });
  const card = /2 \/ 3/.test(info.txt);
  await s.shot("S7-chauffeurs");
  const ok = card && info.flag.length === 1 && info.rows.find((r) => r.includes("Lab Old Driver")).includes("Lab old class") && info.rows.find((r) => r.includes("Lab Old Driver")).includes("Retired class: pick a new one") && !info.rows.find((r) => r.includes("Lab Eco Driver")).includes("Retired class") && !info.rows.find((r) => r.includes("Lab Biz Driver")).includes("Retired class");
  return { s, ok, evidence: `rows ${JSON.stringify(info.rows)}; flags ${JSON.stringify(info.flag)}; "2 / 3" present: ${card}; page text: ${info.txt.slice(0, 350)}` };
}, { s });
process.exit(0);
