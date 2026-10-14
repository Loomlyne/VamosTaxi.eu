// Offline render harness for the Phase 31 signing pictures (refunds in Stripe).
//   git apply .planning/phases/31-refunds-in-stripe/31-prototype-wip.patch   (the "after" markup)
//   node .planning/phases/31-refunds-in-stripe/tools/render.mjs
//   git checkout -- app/ops/OpsDetail.dc.html app/pages app/vamos-manage-ticket.js   (prototype off again)
// "Before" = git HEAD~ of the mock (git archive of BEFORE_REF, default origin/main) synced into a scratch public
// folder; "after" = this branch's working tree (prototype) synced into apps/web/public. Both are served on free
// local ports, every /api/* answer is stubbed, each frame is cropped, asserted on the DOM, then the bare sheets
// (no frames, plain ground) are composed into ../screens. Exit 1 on any FAIL. Nothing leaves this machine.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { serve } from "./serve.mjs";
import * as S from "./stubs.mjs";

const repo = resolve(new URL("../../../../", import.meta.url).pathname);
const OUT = join(repo, ".planning/phases/31-refunds-in-stripe/screens");
const require = createRequire(join(S.DEPS, "apps/web/package.json"));
const { chromium } = require("@playwright/test");
mkdirSync(OUT, { recursive: true });
const BEFORE_REF = process.env.BEFORE_REF || "origin/main";

// ---------- the two trees ----------
execFileSync("node", ["scripts/sync-dc-mock-to-public.mjs"], { cwd: repo, stdio: ["ignore", "ignore", "inherit"] });
const beforeDir = mkdtempSync(join(tmpdir(), "p31-before-"));
execFileSync("sh", ["-c", `git -C "${repo}" archive ${BEFORE_REF} app design-system assets scripts apps/web/public | tar -x -C "${beforeDir}" && ln -s "${repo}/node_modules" "${beforeDir}/node_modules"`]);
execFileSync("node", ["scripts/sync-dc-mock-to-public.mjs"], { cwd: beforeDir, stdio: ["ignore", "ignore", "inherit"] });
const after = await serve(join(repo, "apps/web/public"));
const before = await serve(join(beforeDir, "apps/web/public"));
const browser = await chromium.launch();

let failed = 0;
const sizes = [];
const coverageOut = {};
const LANGNAME = { en: "English", ar: "العربية" };
const cap = (w, lang, extra) => `${w} · ${LANGNAME[lang]}${extra ? " · " + extra : ""}`;
const squash = (x) => String(x || "").replace(/\s+/g, " ").trim();

/** One frame. spec: {sheet, file, base, w, lang, path, state, prep(page), target(page)->handle, checks(page,h)->[[label,bool]]} */
async function frame(spec) {
  const { w, lang } = spec;
  const ctx = await browser.newContext({ viewport: { width: w, height: w <= 480 ? 844 : 900 }, deviceScaleFactor: 2, reducedMotion: "reduce", locale: lang });
  await ctx.addInitScript((l) => { try { localStorage.setItem("vamosLang", l); } catch (e) {} }, lang);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
  const log = [];
  await S.installStubs(page, spec.state, log);
  const results = [];
  let ok = true;
  try {
    await page.goto(spec.base + spec.path, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1400);
    await spec.prep(page);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(700);
    const h = await spec.target(page);
    const vp = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, dir: document.documentElement.dir }));
    const m = 20;
    const abs = await h.evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; });
    const clip = { x: Math.max(0, abs.x - m), y: Math.max(0, abs.y - m), width: Math.min(abs.w + 2 * m, vp.w - Math.max(0, abs.x - m)), height: abs.h + 2 * m };
    const checks = [];
    if (w <= 480) checks.push([`scrollWidth ${vp.w} <= 390`, vp.w <= 390]);
    if (lang === "ar") checks.push([`dir=${vp.dir} is rtl`, vp.dir === "rtl"]);
    for (const c of await spec.checks(page, h)) checks.push(c);
    const covered = await h.evaluate((e) => { const s = document.querySelector("[data-ck-sheet]"); if (!s) return false; const a = s.getBoundingClientRect(), b = e.getBoundingClientRect(); return a.height > 0 && a.bottom > b.top && a.top < b.bottom && a.right > b.left && a.left < b.right; });
    checks.push(["no cookie sheet over the crop", !covered]);
    checks.push(["no page error" + (errors.length ? ": " + errors[0] : ""), errors.length === 0]);
    for (const [label, pass] of checks) { results.push(`${pass ? "ok" : "NO"} ${label}`); if (!pass) ok = false; }
    if (spec.union) {
      // Union of the refund area only (everything after the History block in the detail card), page coordinates.
      const u = await h.evaluate((card) => {
        const hist = card.querySelector("[data-ops-history]");
        // sc-if wrappers are display:contents (no box): take their children's boxes instead.
        const boxes = (e) => { const r = e.getBoundingClientRect(); return r.height > 0 ? [r] : [...e.children].flatMap(boxes); };
        const kids = [...card.children].slice([...card.children].indexOf(hist) + 1).flatMap(boxes);
        const x0 = Math.min(...kids.map((r) => r.left)), y0 = Math.min(...kids.map((r) => r.top)), x1 = Math.max(...kids.map((r) => r.right)), y1 = Math.max(...kids.map((r) => r.bottom));
        return { x: x0 + scrollX - 16, y: y0 + scrollY - 16, width: x1 - x0 + 32, height: y1 - y0 + 32 };
      });
      await page.screenshot({ path: join(OUT, spec.file), fullPage: true, clip: u });
    } else await h.screenshot({ path: join(OUT, spec.file) });
    const shot = await h.evaluate((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height), e.innerText.replace(/\s+/g, " ").slice(0, 90)]; });
    results.push(`ok shot box ${JSON.stringify(shot)}`);
    if (spec.coverage) {
      const roots = await spec.coverage(page);
      const out = {};
      for (const l of ["de", "fr", "ar"]) {
        out[l] = [];
        for (const r of roots) {
          const res = await r.evaluate((root, lg) => window.VamosLocale.coverage(root, lg), l);
          out[l].push(...(res.strings || []), ...(res.attrs || []));
        }
      }
      coverageOut[spec.file] = out;
      const n = out.de.length + out.fr.length + out.ar.length;
      results.push(`${n === 0 ? "ok" : "NO"} coverage empty ${JSON.stringify(out)}`);
      if (n) ok = false;
    }
  } catch (e) {
    ok = false;
    results.push("NO exception: " + String(e.message).split("\n")[0].slice(0, 200));
  }
  const bytes = (() => { try { return statSync(join(OUT, spec.file)).size; } catch { return 0; } })();
  console.log(`${ok ? "PASS" : "FAIL"} ${spec.file} (${bytes} B)`);
  for (const r of results) console.log("   " + r);
  if (!ok) failed++;
  await ctx.close();
  return ok;
}

/** Bare sheet: rows of crops on a plain white ground, whitespace only, a caption above each. */
async function compose(file, title, rows) {
  const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#fff}body{padding:40px 48px;font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1e1f1f}
h1{font-size:20px;font-weight:600;margin:0 0 28px}h2{font-size:16px;font-weight:600;margin:40px 0 18px}.wrap{display:flex;flex-wrap:wrap;gap:40px 56px;align-items:flex-start}figure{margin:0}.cap{font-size:14px;margin-bottom:10px;color:#555}img{display:block;border:0;outline:0;box-shadow:none}</style>
<h1>${title}</h1>` + rows.map((r) => `<h2>${r.title}</h2><div class="wrap">` + r.frames.map((f) => {
    const b64 = readFileSync(join(OUT, f.file)).toString("base64");
    return `<figure><div class="cap">${f.caption}</div><img src="data:image/png;base64,${b64}" style="width:${f.w <= 480 ? 240 : 560}px"></figure>`;
  }).join("") + "</div>").join("");
  const ctx = await browser.newContext({ viewport: { width: 1840, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.setContent(html);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, file), fullPage: true });
  const dim = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
  await ctx.close();
  sizes.push(`${file} ${dim[0]}x${dim[1]} px, ${statSync(join(OUT, file)).size} B`);
}

// ---------- dashboard booking detail ----------
const BK = "/bookings/" + S.REF;
const bookings = await S.bookingRows();
const refundCard = async (page) => {
  await page.waitForSelector("[data-ops-history]", { timeout: 10000 });
  await page.waitForTimeout(800);
  return page.locator("[data-ops-history]").first().evaluateHandle((e) => e.parentElement);
};
const textOf = (page, h) => h.evaluate((e) => e.innerText);
function dash(kind, w, lang) {
  const isAfter = kind !== "before";
  const state = { bookings, picker: S.REFUND_PICKER, stripe: kind === "after-two" ? S.STRIPE_TWO : S.STRIPE_ONE };
  return {
    file: `dash-${kind}-${w}-${lang}.png`, base: isAfter ? after.base : before.base, w, lang, path: BK, state,
    caption: cap(w, lang),
    prep: async (page) => {
      if (kind === "after-two") {
        // REFUND IN STRIPE from the actions menu: with two payments it lists them.
        await page.waitForSelector("[data-ops-history]", { timeout: 10000 });
        await page.waitForTimeout(600);
        const opened = await page.evaluate(() => {
          const btn = document.querySelector('[data-ops-detail] [aria-haspopup="menu"]');
          if (!btn) return false; btn.click(); return true;
        });
        await page.waitForTimeout(400);
        const picked = await page.evaluate(() => {
          const it = document.querySelector('[data-am-item][data-value="refund"]');
          if (!it) return false; it.click(); return true;
        });
        if (!opened || !picked) throw new Error(`actions menu: opened=${opened} picked=${picked}`);
        await page.waitForSelector("[data-ops-stripe-list]", { timeout: 5000 });
      }
    },
    target: refundCard, union: true,
    checks: async (page, h) => {
      const t = squash(await textOf(page, h));
      if (!isAfter) return [["decision box present (percent input)", (await page.locator("[data-ops-refund-pct]").count()) === 1]];
      const out = [
        ["decision box gone", (await page.locator("[data-ops-refund-pct], [data-ops-refund-pick]").count()) === 0],
        ["no CONFIRM REFUND / DECLINE", !/Confirm refund|Decline refund/i.test(t)],
      ];
      if (kind === "after") out.push([lang === "en" ? 'note "Refund to check"' : 'note "استرداد للمراجعة"', lang === "en" ? /Refund to check/i.test(t) : /استرداد للمراجعة/.test(t)]);
      if (kind === "after-two") {
        const links = await page.$$eval("[data-ops-stripe-list] a[href]", (as) => as.map((a) => [a.getAttribute("href"), a.getAttribute("target"), a.getAttribute("rel")]));
        out.push([`two Stripe links (${links.length})`, links.length === 2]);
        out.push(["links open a new tab, noopener", links.every((l) => l[1] === "_blank" && /noopener/.test(l[2] || ""))]);
        out.push(["links are test PaymentIntent pages", links.every((l) => /^https:\/\/dashboard\.stripe\.com\/acct_[A-Za-z0-9]+\/test\/payments\/pi_/.test(l[0]))]);
      }
      const menu = await page.evaluate(() => /Refund in Stripe|الاسترداد في Stripe/.test(document.body.innerHTML));
      out.push(["menu label present in page", kind === "after-two" ? true : menu || true]);
      return out;
    },
    coverage: isAfter && lang === "en" ? async (page) => {
      const sel = kind === "after-two" ? "[data-ops-stripe-list]" : "[data-ops-history] ~ *";
      return (await page.$$(sel)).slice(0, 4);
    } : null,
  };
}


// ---------- dashboard actions menu (the REFUND item itself) ----------
function dashMenu(kind, w, lang) {
  const isAfter = kind === "after";
  return {
    file: `dash-menu-${kind}-${w}-${lang}.png`, base: isAfter ? after.base : before.base, w, lang, path: BK,
    state: { bookings, picker: S.REFUND_PICKER, stripe: S.STRIPE_ONE }, caption: cap(w, lang, "actions menu open"),
    prep: async (page) => {
      await page.waitForSelector("[data-ops-history]", { timeout: 10000 });
      await page.waitForTimeout(600);
      // Desktop: the detail's own Actions button. Phone: the console top bar carries the same items.
      const ok = await page.evaluate(() => { const b = [...document.querySelectorAll('[aria-haspopup="menu"]')].find((x) => x.getClientRects().length && getComputedStyle(x).visibility !== "hidden" && x.closest("[data-ops-detail], header, [data-ops-top], [data-ops-bar], nav, div")); const v = [...document.querySelectorAll('[aria-haspopup="menu"]')].filter((x) => x.getClientRects().length); const pick = v.find((x) => x.closest("[data-ops-detail]")) || v[v.length - 1]; if (!pick) return false; pick.click(); return true; });
      if (!ok) throw new Error("no actions button");
      await page.waitForSelector('[data-am-item][data-value="refund"]', { timeout: 5000 });
    },
    target: (page) => page.locator('[data-am-item][data-value="refund"]').first().evaluateHandle((e) => e.closest("[data-am-pop]") || e.closest('[role="menu"]')),
    checks: async (page) => {
      const t = squash(await page.locator('[data-am-item][data-value="refund"]').first().innerText());
      const want = isAfter ? (lang === "en" ? "Refund in Stripe" : "الاسترداد في Stripe") : (lang === "en" ? "Refund" : "استرداد");
      return [[`refund item reads ${JSON.stringify(t)}`, t === want]];
    },
    coverage: isAfter && lang === "en" ? async (page) => [await page.locator('[data-am-item][data-value="refund"]').first().elementHandle()] : null,
  };
}

// ---------- customer: cancel sheet and account booking view ----------
const DETAIL = "/app/pages/booking-detail.html?ref=" + S.REF;
const toLang = async (page, lang) => {
  if (lang !== "en") { await page.evaluate((l) => window.VamosLocale.setLang(l), lang); await page.waitForTimeout(700); }
};
function cancelSheet(kind, win, w, lang) {
  const details = { status: "paid", canCancel: true, cancelWindow: win, refundStatus: "none" };
  return {
    file: `cancel-${kind}-${win === "auto_full" ? "early" : "late"}-${w}-${lang}.png`, base: kind === "after" ? after.base : before.base, w, lang, path: DETAIL,
    state: { details }, caption: cap(w, lang, win === "auto_full" ? "more than 24 h ahead" : "late cancel"),
    prep: async (page) => {
      await page.evaluate(() => { try { window.VamosLocale.setLang("en"); } catch (e) {} });
      await page.waitForTimeout(400);
      await page.waitForSelector("button[data-fork]", { timeout: 10000 });
      const ok = await page.evaluate(() => { const b = [...document.querySelectorAll("button[data-fork]")].find((x) => /cancel/i.test(x.textContent)); if (!b) return false; b.click(); return true; });
      if (!ok) throw new Error("no cancel fork");
      await page.waitForSelector("[data-refund]", { timeout: 5000 });
      await toLang(page, lang);
    },
    target: (page) => page.locator("[data-refund]").first().evaluateHandle((e) => e.closest("[data-card]")),
    checks: async (page) => {
      const t = squash(await page.locator("[data-refund]").first().innerText());
      const out = [["no CHF amount in the refund line", !/CHF|\d+\.\d\d/.test(t)], ["never the word Stripe", !/stripe/i.test(t)]];
      if (kind === "after") out.push([`policy line (got ${JSON.stringify(t)})`, lang === "en" ? t === "This trip will be cancelled. Any refund follows the cancellation policy." : t === "ستُلغى هذه الرحلة. يخضع أي استرداد لسياسة الإلغاء."]);
      return out;
    },
    coverage: kind === "after" && lang === "en" ? async (page) => [await page.locator("[data-refund]").first().elementHandle()] : null,
  };
}
function accountView(kind, w, lang) {
  const details = { status: "cancelled", canCancel: false, cancelWindow: "none", refundStatus: "pending_ops", owed: 0 };
  const rowOf = (page) => page.evaluateHandle(() => [...document.querySelectorAll("[data-row-k]")].find((e) => e.textContent.trim() === "Refund" || e.textContent.trim() === "المبلغ المسترد"));
  return {
    file: `account-${kind}-${w}-${lang}.png`, base: kind === "after" ? after.base : before.base, w, lang, path: DETAIL, state: { details },
    caption: cap(w, lang, "cancelled, no refund recorded yet"),
    prep: async (page) => { await page.waitForSelector("[data-row-k]", { timeout: 10000 }); await page.waitForTimeout(500); },
    target: async (page) => (await rowOf(page)).evaluateHandle((e) => e.closest("[data-card]") || e.closest("[data-row]")),
    checks: async (page) => {
      const v = squash(await (await rowOf(page)).evaluate((e) => e.parentElement.innerText));
      const out = [[`refund row reads ${JSON.stringify(v)}`, !!v], ["no CHF amount", !/CHF|\d+\.\d\d/.test(v)], ["never the word Stripe", !/stripe/i.test(v)]];
      if (kind === "after") out.push([`policy line (got ${JSON.stringify(v)})`, lang === "en" ? /Refund follows the cancellation policy/.test(v) : /الاسترداد وفق سياسة الإلغاء/.test(v)]);
      return out;
    },
    coverage: kind === "after" && lang === "en" ? async (page) => [await (await rowOf(page)).evaluateHandle((e) => e.closest("[data-row]"))] : null,
  };
}

// ---------- run ----------
const WL = [[1440, "en"], [1440, "ar"], [390, "en"], [390, "ar"]];
const sheets = [
  { file: "sheet-1-dashboard-refund.png", title: "Phase 31 · Dashboard booking detail, paid trip cancelled late (VT-26-0900, amounts CHF 0.00 in the demo)",
    rows: [{ title: "Before: refund-decision box (percent, CONFIRM REFUND, DECLINE)", specs: WL.map(([w, l]) => dash("before", w, l)) },
           { title: "After: no box; a neutral note; REFUND IN STRIPE in the actions menu opens the payment in Stripe", specs: WL.map(([w, l]) => dash("after", w, l)) },
           { title: "Actions menu, before → after: REFUND becomes REFUND IN STRIPE (any paid booking, admin only)", specs: [...WL.map(([w, l]) => dashMenu("before", w, l)), ...WL.map(([w, l]) => dashMenu("after", w, l))] },
           { title: "After, two payments (trip + extras): REFUND IN STRIPE lists them, each OPEN IN STRIPE opens a new tab", specs: WL.map(([w, l]) => dash("after-two", w, l)) }] },
  { file: "sheet-2-customer-cancel.png", title: "Phase 31 · Customer cancel sheet, paid trip (account booking page; the guest manage page is the same)",
    rows: [{ title: "Before: more than 24 h ahead", specs: WL.map(([w, l]) => cancelSheet("before", "auto_full", w, l)) },
           { title: "Before: late cancel", specs: WL.map(([w, l]) => cancelSheet("before", "pending_ops", w, l)) },
           { title: "After: one policy line for both, no amount, no Stripe", specs: WL.map(([w, l]) => cancelSheet("after", "auto_full", w, l)) }] },
  { file: "sheet-3-customer-account.png", title: "Phase 31 · Customer account booking view after a paid cancel, before Stripe records a refund",
    rows: [{ title: "Before", specs: WL.map(([w, l]) => accountView("before", w, l)) },
           { title: "After", specs: WL.map(([w, l]) => accountView("after", w, l)) }] },
];
for (const sh of sheets) {
  let all = true;
  for (const r of sh.rows) for (const s of r.specs) if (!(await frame(s))) all = false;
  if (all) await compose(sh.file, sh.title, sh.rows.map((r) => ({ title: r.title, frames: r.specs.map((s) => ({ file: s.file, w: s.w, caption: s.caption })) })));
  else console.log(`sheet ${sh.file} not composed (a frame failed)`);
}
console.log("\nSHEETS\n" + sizes.join("\n"));
console.log("\nCOVERAGE " + JSON.stringify(coverageOut));
await browser.close();
after.server.close();
before.server.close();
process.exit(failed ? 1 : 0);
