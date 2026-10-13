import fs from "node:fs";
import { DASH, BASE } from "/Users/koss/.vamos-scratch/p30-clean/scripts/test-lab/lab-browser.mjs";
export async function signIn(s) {
  const f = Object.fromEntries(fs.readFileSync(process.env.LAB_ADMIN_FILE, "utf8").split("\n").filter(Boolean).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
  await s.page.goto(DASH + "/login", { waitUntil: "networkidle" });
  const r = await s.page.evaluate(async ({ email, password }) => {
    const x = await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ locale: "en", mode: "signin", method: "password", email, password }) });
    return x.status + " " + (await x.text());
  }, f);
  return r;
}
