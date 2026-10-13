import fs from "node:fs";
import * as L from "/Users/koss/.vamos-scratch/p30-clean/scripts/test-lab/lab-browser.mjs";
import { signIn } from "./common.mjs";
export * from "/Users/koss/.vamos-scratch/p30-clean/scripts/test-lab/lab-browser.mjs";
export { signIn };
export const EV = "/Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/phase-30-vehicle-class-lifecycle/.planning/phases/30-vehicle-class-lifecycle/evidence/lab";
const RES = `${EV}/results.json`;
/** Merge this run's results into results.json by id (the lab-browser step() keeps its own list). */
export function saveResults(list) {
  const old = fs.existsSync(RES) ? JSON.parse(fs.readFileSync(RES, "utf8")).results : [];
  const m = new Map(old.map((r) => [r.id, r]));
  for (const r of list) m.set(r.id, r);
  fs.writeFileSync(RES, JSON.stringify({ at: new Date().toISOString(), base: L.BASE, results: [...m.values()] }, null, 1));
}
const mine = [];
/** step(): like lab-browser step but records locally for saveResults. */
export async function S(id, title, fn, opts = {}) {
  let status = "PASS", evidence = "", s = null;
  try {
    const r = await fn();
    s = r?.s ?? opts.s ?? null; evidence = String(r?.evidence ?? r ?? title).replace(/\s+/g, " ").slice(0, 900);
    if (r?.ok === false) status = "FAIL";
    if (r?.blocked) status = "BLOCKED";
  } catch (e) { s = opts.s ?? null; status = "FAIL"; evidence = String(e?.message ?? e).split("\n")[0].slice(0, 600); }
  if (s && (status !== "PASS" || opts.shot)) await s.shot(id).catch(() => {});
  mine.push({ id, title, status, evidence });
  console.log(`${status} | ${id} | ${evidence}`);
  saveResults([mine[mine.length - 1]]);
  return status === "PASS";
}
export const dlgText = (page) => page.evaluate(() => (document.querySelector('[role="dialog"]')?.innerText ?? "NO DIALOG").replace(/\n+/g, " | "));
export async function goPricing(s, pane = 1) {
  await s.page.goto(L.DASH + "/pricing", { waitUntil: "networkidle" });
  await s.page.waitForTimeout(1500);
  await s.page.locator("button[data-set-item]").nth(pane).click();
  await s.page.waitForTimeout(1000);
}
export const row = (page, name) => page.locator("tr, [role=row]", { has: page.locator("[data-class-name]", { hasText: name }) }).first();
export async function jpeg(page, path) {
  const b64 = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 64; c.height = 64; const x = c.getContext("2d"); x.fillStyle = "#888"; x.fillRect(0, 0, 64, 64); return c.toDataURL("image/jpeg", 0.8).split(",")[1]; });
  fs.writeFileSync(path, Buffer.from(b64, "base64"));
  return path;
}
export const dbg = async (page) => console.log((await page.evaluate(() => document.body.innerText)).slice(0, 1500));
/** Reads the Go live dialog: items with state + icon mask, why-line, whether why sits directly above the actions, button states. */
export async function goLiveInfo(page) {
  return page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]'); if (!d) return null;
    const items = [...d.querySelectorAll("[data-golive-item]")].map((li) => {
      const ic = li.querySelector("[aria-hidden]");
      const mask = ic ? (getComputedStyle(ic).maskImage || getComputedStyle(ic).webkitMaskImage || "").replace(/.*assets\/icons\//, "").replace(/["')]/g, "") : "";
      return `${li.querySelector(":scope > span").innerText}=${li.dataset.state}(${mask})`;
    });
    const why = d.querySelector("[data-golive-why]");
    const act = d.querySelector("[data-hide-actions]");
    const btns = [...d.querySelectorAll("[data-hide-actions] button")].map((b) => `${b.innerText.trim()}:${b.disabled ? "disabled" : "enabled"}`);
    return { items, why: why ? why.innerText : null, whyDirectlyAboveButtons: !!(why && why.nextElementSibling === act), btns, title: d.querySelector(".vt-dialog__title")?.innerText };
  });
}
export const gl = (o) => o && `${o.title}; ${o.items.join(", ")}; why=${JSON.stringify(o.why)}; whyAboveButtons=${o.whyDirectlyAboveButtons}; ${o.btns.join(" ")}`;
/** Retire dialog read: title, body paragraphs in order, notes block, textarea presence, buttons. */
export async function retireInfo(page) {
  return page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]'); if (!d) return null;
    const box = d.querySelector("[data-retire-dialog]");
    const notes = [...d.querySelectorAll("[data-retire-notes] > *")].map((n) => n.innerText.replace(/\s+/g, " ").trim());
    const kids = box ? [...box.children].map((n) => (n.dataset.hideClass !== undefined ? "NAME" : n.hasAttribute("data-hide-body") ? "BODY" : n.hasAttribute("data-retire-notes") ? "NOTES" : n.hasAttribute("data-retire-lastlive") ? "LASTLIVE" : n.tagName)) : [];
    return { title: d.querySelector(".vt-dialog__title")?.innerText, name: d.querySelector("[data-hide-class]")?.innerText, notes, order: kids, lastLive: !!d.querySelector("[data-retire-lastlive]"), dir: getComputedStyle(d).direction, btns: [...d.querySelectorAll("[data-hide-actions] button, .vt-dialog__foot button")].map((b) => b.innerText.trim()), text: d.innerText.replace(/\s+/g, " | ").slice(0, 600) };
  });
}
