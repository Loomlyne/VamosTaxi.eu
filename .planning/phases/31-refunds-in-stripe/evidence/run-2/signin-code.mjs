import fs from "node:fs"; import { execSync } from "node:child_process";
import { DASH } from "../../../../../scripts/test-lab/lab-browser.mjs";
const latest = () => execSync("ls -t /Users/koss/.t3/worktrees/VamosTaxi.eu/phase-31-refunds-in-stripe/apps/web/.wrangler/tmp/email/*/email-text/*.txt | head -1").toString().trim();
export async function signInCode(page) {
  const f = Object.fromEntries(fs.readFileSync(process.env.LAB_ADMIN_FILE, "utf8").split("\n").filter(Boolean).map(l=>[l.slice(0,l.indexOf("=")), l.slice(l.indexOf("=")+1)]));
  const before = latest();
  await page.goto(DASH + "/login", { waitUntil: "networkidle" });
  await page.locator('input[type=email]').fill(f.email);
  await page.getByRole("button",{name:/email me a link/i}).click();
  let file; for (let i=0;i<40;i++){ await page.waitForTimeout(500); file = latest(); if (file!==before) break; }
  const code = /^\s*(\d{6})\s*$/m.exec(fs.readFileSync(file,"utf8"))[1];
  await page.getByLabel(/6-digit code/i).fill(code);
  await page.getByRole("button",{name:/^sign in$/i}).click();
  await page.waitForURL((u)=>!/\/login/.test(u.pathname),{timeout:20000});
}
