import { start, open, goPricing, signIn, S, db } from "./lib.mjs";
await start({ evidenceDir: process.argv[2] });
const s = await open({ viewport: 1440, name: "s1440" });
await signIn(s);
await goPricing(s);
console.log((await s.page.evaluate(() => document.body.innerText)).slice(0, 2500));
console.log(await s.page.evaluate(() => [...document.querySelectorAll("[data-draft-btn],[data-class-name]")].map(e=>e.outerHTML.slice(0,160))));
process.exit(0);
