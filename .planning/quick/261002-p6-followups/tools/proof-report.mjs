// Quick 261002-p6-followups: writes evidence/PROOF.md from what the last runs left in evidence/ (proof-browser.json,
// mirror-worker.json / mirror-worker.txt) and, when it exists, evidence/PROOF-NOTES.md (written by hand: what the findings mean).
// usage (proof-run.sh report): PROOF_EVID PROOF_JOB PROOF_TREE
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const EVID = process.env.PROOF_EVID;
const JOB = process.env.PROOF_JOB;
const TREE = process.env.PROOF_TREE;
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(EVID, f), "utf8")); } catch (e) { return null; } };
const readText = (f) => { try { return fs.readFileSync(path.join(EVID, f), "utf8"); } catch (e) { return ""; } };
const git = (...a) => { try { return execFileSync("git", ["-C", TREE, ...a]).toString().trim(); } catch (e) { return "?"; } };
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const cut = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + "…" : String(s));

const b = read("proof-browser.json");
const m = read("mirror-worker.json");
const mirrorTxt = readText("mirror-worker.txt");
const notes = readText("PROOF-NOTES.md");
const out = [];
const w = (s = "") => out.push(s);

const built = (() => { try { return fs.statSync(path.join(TREE, "apps/web/.open-next/worker.js")).mtime.toISOString(); } catch (e) { return "no build"; } })();
w("# Proof run: 261002-p6-followups");
w();
w(`Written by \`tools/proof-report.mjs\` from the files in this folder; \`tools/proof-run.sh all\` makes the whole run again (one command).`);
w();
w("## What ran");
w();
w(`- Tree: \`${git("rev-parse", "--short", "HEAD")}\` ${git("log", "-1", "--format=%s")}; ${git("status", "--short").split("\n").filter(Boolean).length} path(s) uncommitted at report time.`);
const bh = (() => { try { return fs.readFileSync(path.join(TREE, "apps/web/.wrangler/proof-build.head"), "utf8").trim().split("\n"); } catch (e) { return null; } })();
if (bh) w(`- Built from: \`${bh[0]}\` with ${bh[1]} tracked file(s) modified and uncommitted at build time.`);
w(`- Build: \`pnpm --filter web exec opennextjs-cloudflare build\` after \`node scripts/sync-dc-mock-to-public.mjs\`; \`.open-next/worker.js\` written ${built}.`);
w("- Workers: the built bundle on `wrangler dev` (public :4790, dashboard `dashboard.localhost:4791`), the local stand-ins for Stripe, Mapbox, Resend and Turnstile on :4797 (fetch rewrite of the built worker.js only), own Supabase stack `vamos-taxi-p6f` (API 61621, DB 61622). Nothing stubbed in the Worker or in the page.");
w("- Seed: `apps/web/lib/ops/p6-followups-browser.local-seed.test.ts` (three paid bookings of one customer: `van10` Van luxury 12 seats with 10 travellers and 6 bags; `waiting` with the owner's dearer change waiting for its difference; `plain`). Amounts are synthetic rappen (paid CHF 0.83).");
w("- Browser: Playwright Chromium; one context per case with its own client address (the write limiter is 4 a minute per address). Guest = the e-mailed manage link `/manage-booking?token=`; signed in = `/booking-detail?ref=` with the customer's session (the route `/account/bookings/<ref>` does not exist; the account booking page is `/booking-detail`).");
w();

if (b) {
  const R = b.results;
  const group = (id) => id.split(" ")[0];
  const groups = [...new Set(R.map((r) => group(r.id)))];
  w(`## Result of the browser run (${b.at})`);
  w();
  w("| group | PASS | FAIL | n/a |");
  w("|---|---|---|---|");
  for (const g of groups) {
    const rs = R.filter((r) => group(r.id) === g);
    w(`| ${g} | ${rs.filter((r) => r.ok === true).length} | ${rs.filter((r) => r.ok === false).length} | ${rs.filter((r) => r.ok === null).length} |`);
  }
  const bad = R.filter((r) => r.ok === false);
  w();
  if (bad.length) {
    w("### Failed");
    w();
    for (const r of bad) w(`- **${r.id}** ${r.name}: ${cut(r.detail, 700)}`);
    w();
  } else {
    w("No check failed.");
    w();
  }
  w("### Every check");
  w();
  w("| id | result | what | evidence |");
  w("|---|---|---|---|");
  for (const r of R) w(`| ${esc(r.id)} | ${r.ok === null ? "N/A" : r.ok ? "PASS" : "FAIL"} | ${esc(cut(r.name, 90))} | ${esc(cut(r.detail, r.ok === false ? 600 : 230))} |`);
  w();
  w("### Translation coverage (`VamosLocale.coverage(main)`)");
  w();
  w("Raw count and the entries that are page copy without a de/fr/ar line. Entries that are the booking's own data (date label, place names, as the server sends them) or the VAT line (built in the active language in code) are listed apart: they are not page copy.");
  w();
  w("| page | lang | view | raw count | page copy without translation | data / built in code |");
  w("|---|---|---|---|---|---|");
  for (const c of b.coverage.filter((x) => x.copy)) {
    w(`| ${c.door === "guest" ? "manage-booking" : "booking-detail"} | ${c.lang} | ${c.view} | ${c.count} | ${c.copy.length ? esc(c.copy.map((s) => `"${cut(s, 70)}"`).join(", ")) : "none"} | ${c.other.length ? esc(c.other.map((s) => `"${cut(s, 40)}"`).join(", ")) : "none"} |`);
  }
  w();
  if (b.notes && b.notes.length) {
    w("### Notes from the run");
    w();
    for (const n of b.notes) w(`- ${n}`);
    w();
  }
  w(`### Screenshots (${b.shots.length}), \`.planning/quick/261002-p6-followups/\``);
  w();
  const bySet = {};
  for (const s of b.shots) (bySet[path.basename(s).split("-")[0] + "-" + (path.basename(s).split("-")[1] ?? "")] ??= []).push(s);
  for (const [k, v] of Object.entries(bySet)) w(`- ${k} (${v.length}): \`${v[0]}\` ... \`${v[v.length - 1]}\``);
  w();
}

w("## Mirror check on the Worker (`tools/mirror-check.mjs`, `tools/proof-mirror.mjs`)");
w();
if (m) {
  const rows = m.filter((r) => r.icon);
  const spots = [...new Set(m.map((r) => r.spot))];
  w("| spot | lang | width | icons | result | mirror product (ar must be -1, en +1) |");
  w("|---|---|---|---|---|---|");
  const keys = new Map();
  for (const r of m) {
    const k = `${r.spot}|${r.lang}|${r.width}`;
    const g = keys.get(k) ?? { spot: r.spot, lang: r.lang, width: r.width, n: 0, bad: 0, prods: new Set(), err: "" };
    if (r.error) g.err = r.error;
    if (r.icon) { g.n++; if (!r.ok) g.bad++; g.prods.add(`${r.icon} ${r.product > 0 ? "+1" : "-1"}`); }
    keys.set(k, g);
  }
  for (const g of keys.values()) {
    w(`| ${g.spot} | ${g.lang} | ${g.width} | ${g.n} | ${g.err ? `FAIL (${esc(cut(g.err, 120))})` : g.bad ? `FAIL x${g.bad}` : g.n ? "PASS" : "FAIL (none found)"} | ${esc([...g.prods].join(", "))} |`);
  }
  w();
  w(`${rows.length} icon(s) in ${spots.length} spot(s); ${rows.filter((r) => !r.ok).length} icon(s) outside the rule; ${m.filter((r) => r.error).length} spot run(s) that did not run.`);
  const arrows = m.filter((r) => r.spot === "ops-change-arrow" && r.icon);
  w();
  w(`Dashboard change row (\`[data-ops-chg-arrow]\`, the old to new arrow of the Edit preview): ${arrows.length ? arrows.map((r) => `${r.lang} ${r.width}px product ${r.product > 0 ? "+1" : "-1"} (${r.path})`).join("; ") : "not reached (see the spot lines above)"}.`);
} else {
  w("Not run (no `mirror-worker.json`).");
}
if (mirrorTxt) {
  w();
  w("Raw lines (`evidence/mirror-worker.txt`):");
  w();
  w("```");
  for (const l of mirrorTxt.split("\n").filter((x) => /^(ok|FAIL|skip|note|PASS|signed|admin)/.test(x)).slice(0, 140)) w(l);
  w("```");
}
w();
if (notes.trim()) {
  w("## Notes");
  w();
  w(notes.trim());
  w();
}
fs.writeFileSync(path.join(EVID, "PROOF.md"), out.join("\n") + "\n");
console.log(`wrote ${path.join(EVID, "PROOF.md")} (${out.length} lines)`);
void JOB;
