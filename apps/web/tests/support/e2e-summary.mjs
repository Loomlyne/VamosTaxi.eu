// apps/web/tests/support/e2e-summary.mjs
//
// Reads a Playwright JSON report and prints a markdown summary: totals, then every failing or flaky
// test with its first error line. Used by .github/workflows/e2e-linux.yml for GITHUB_STEP_SUMMARY.
import { existsSync, readFileSync } from "node:fs";

const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.log("### e2e report missing\n\nPlaywright wrote no JSON report (the run was cut before it finished).");
  process.exit(0);
}
const report = JSON.parse(readFileSync(file, "utf8"));
const s = report.stats ?? {};
const minutes = ((s.duration ?? 0) / 60000).toFixed(1);
const lines = [`### Totals: ${s.expected ?? 0} passed, ${s.unexpected ?? 0} failed, ${s.flaky ?? 0} flaky, ${s.skipped ?? 0} skipped (${minutes} min of specs)`, ""];
const rows = [];
const strip = (t) => t.replace(/\u001b\[[0-9;]*m/g, "");
function walk(suite) {
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      if (t.status !== "unexpected" && t.status !== "flaky") continue;
      const err = strip(t.results?.at(-1)?.error?.message ?? "").split("\n").find((l) => l.trim()) ?? "";
      rows.push(`- ${t.status} · ${t.projectName} · ${spec.file} › ${spec.title.slice(0, 90)} — ${err.slice(0, 160)}`);
    }
  }
  for (const child of suite.suites ?? []) walk(child);
}
for (const suite of report.suites ?? []) walk(suite);
lines.push(rows.length ? rows.join("\n") : "No failing or flaky tests.");
if ((report.errors ?? []).length) lines.push("", "Run errors: " + report.errors.map((e) => strip(e.message ?? "").split("\n")[0]).join(" | "));
console.log(lines.join("\n"));
