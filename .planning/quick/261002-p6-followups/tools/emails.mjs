// Arabic e-mail pictures, before and after.
// usage: node emails.mjs <raw out dir> <scratch dir>
// 1. bundles emails-entry.tsx (the real templates of packages/emails) with the repo's esbuild,
// 2. writes email-<name>-before-ar.html, and email-<name>-after-ar.html where the visible phone is wrapped
//    in a left-to-right isolate (only the visible text; there is no tel: link in any of these e-mails),
// 3. screenshots each at 600 px wide, cropped to the phone line with a few lines of context.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const here = new URL(".", import.meta.url).pathname;
const repo = resolve(here, "../../../..");
const [out, scratch] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
mkdirSync(scratch, { recursive: true });

const bundle = `${scratch}/emails.bundle.mjs`;
execFileSync(
  `${repo}/node_modules/.pnpm/esbuild@0.28.1/node_modules/esbuild/bin/esbuild`,
  [
    `${here}emails-entry.tsx`,
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--jsx=automatic",
    "--loader:.png=dataurl",
    `--outfile=${bundle}`,
    `--banner:js=import {createRequire as __cr} from "node:module"; const require = __cr(import.meta.url);`,
    "--log-level=warning",
  ],
  { env: { ...process.env, NODE_PATH: `${repo}/packages/emails/node_modules` }, stdio: "inherit" },
);
const { build } = await import(pathToFileURL(bundle).href + `?t=${Date.now()}`);
const mails = await build();

const PHONE = "+41 79 626 70 82";
const WRAP = `<span dir="ltr" style="unicode-bidi:isolate;direction:ltr;white-space:nowrap">${PHONE}</span>`;
const counts = {};
for (const [name, html] of Object.entries(mails)) {
  const n = html.split(PHONE).length - 1;
  counts[name] = n;
  writeFileSync(`${out}/email-${name}-before-ar.html`, html);
  writeFileSync(`${out}/email-${name}-after-ar.html`, html.split(PHONE).join(WRAP));
}
console.log("phone occurrences per e-mail", JSON.stringify(counts));

const require = createRequire(new URL("../../../../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const logo = readFileSync(`${repo}/packages/emails/src/wordmark-email.png`);
const browser = await chromium.launch();
for (const name of Object.keys(mails)) {
  for (const side of ["before", "after"]) {
    const ctx = await browser.newContext({ viewport: { width: 600, height: 900 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.route("https://vamostaxi.site/brand/**", (r) => r.fulfill({ body: logo, contentType: "image/png" }));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.abort());
    await page.route("https://vamostaxi.site/brand/**", (r) => r.fulfill({ body: logo, contentType: "image/png" }));
    await page.goto(pathToFileURL(`${out}/email-${name}-${side}-ar.html`).href, { waitUntil: "load" });
    await page.waitForTimeout(300);
    const phone = page.getByText(PHONE).first();
    const box = await phone.boundingBox();
    const file = `${out}/email-${name}-${side}-ar.png`;
    // Crop inside the white card only: the grey ground around it is the e-mail client's, not part of the picture.
    const card = await page.locator('table[width="560"], [style*="max-width:560px"]').first().boundingBox();
    const top = Math.max(card.y, box.y - 190);
    const bottom = Math.min(card.y + card.height, box.y + box.height + 40);
    await page.screenshot({ path: file, clip: { x: card.x, y: top, width: card.width, height: bottom - top }, fullPage: true });
    // Where the digits sit, and which way they read: the order of the characters the browser lays out.
    const read = await page.evaluate((p) => {
      const el = [...document.querySelectorAll("body *")].find((e) => e.childElementCount === 0 && (e.textContent || "").includes(p));
      return el ? { dir: getComputedStyle(el).direction, text: el.textContent.trim().slice(0, 60) } : null;
    }, PHONE);
    console.log("ok", name, side, JSON.stringify(read));
    await ctx.close();
  }
}
await browser.close();
