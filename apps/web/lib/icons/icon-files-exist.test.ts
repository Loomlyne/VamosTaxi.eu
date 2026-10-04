// An icon name with no file draws nothing and raises no error anywhere: the dashboard distance chip
// asked for `route`, which was never vendored (owner, 2026-10-04). This reads every place a screen
// names an icon and fails when the file is missing.
//   Mocks (the live site and dashboard): assets/icons/<name>.svg, copied to public/assets/icons by the sync.
//   Design-system bundle: the names its own components draw (Alert, Toast, status badges, close buttons).
//   React app: apps/web/public/brand/icons/<name>.svg, a separate copy that Icon.tsx serves.
// Icons are only ever added from Lucide, one download approved by the owner at a time.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DYNAMIC_ICON_BINDINGS } from "./dynamic-icon-bindings";
import { scanBundle, scanMocks, scanReact, vendoredIcons } from "./icon-references";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const assetsIcons = join(repoRoot, "assets/icons");
const brandIcons = join(repoRoot, "apps/web/public/brand/icons");

/**
 * Names the screens ask for that have no file in assets/icons yet. Each waits for the owner's
 * download approval (one Lucide icon at a time): `name: "where it shows, waiting for the owner's download approval"`.
 * The test fails when a name here gets its file or stops being asked for, so this list only ever shrinks.
 * Empty since 2026-10-04: route, arrow-down, tag, sun and moon were all approved and vendored.
 */
const WAITING_FOR_DOWNLOAD: Record<string, string> = {};

/** The React app asks for no name without a file today. */
const REACT_WAITING_FOR_DOWNLOAD: Record<string, string> = {};

const mocks = scanMocks(repoRoot);
const bundle = scanBundle(repoRoot);
const react = scanReact(repoRoot);
const assets = new Set(vendoredIcons(assetsIcons));
const brand = new Set(vendoredIcons(brandIcons));

/** Everything the mocks and the bundle ask for: name -> where. */
function asked(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (name: string, where: string) => out.set(name, [...(out.get(name) ?? []), where]);
  for (const r of [...mocks.refs, ...bundle]) add(r.name, `${r.file}:${r.line} (${r.via})`);
  for (const d of DYNAMIC_ICON_BINDINGS) for (const v of d.values) for (const f of d.files) add(v, `${f} {{ ${d.expr} }}`);
  return out;
}

function walkSources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkSources(p, out);
    else if (/\.(html|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

function missing(names: Map<string, string[]>, have: Set<string>, waiting: Record<string, string>): string[] {
  return [...names].filter(([n]) => !have.has(n) && !(n in waiting)).map(([n, where]) => `${n}: ${where.slice(0, 3).join(", ")}`);
}

describe("every icon name a screen asks for has a file", () => {
  it("the scan reads what it should (a broken pattern must not pass as empty)", () => {
    expect(mocks.refs.length).toBeGreaterThan(500);
    expect(mocks.refs.filter((r) => r.via === "attr").length).toBeGreaterThan(300);
    expect(mocks.refs.filter((r) => r.via === "meta").length).toBeGreaterThan(30);
    expect(mocks.dynamic.length).toBeGreaterThan(40);
    expect(bundle.length).toBeGreaterThan(15);
    expect(react.union.length).toBeGreaterThan(60);
    expect(react.refs.length).toBeGreaterThan(80);
    expect(assets.size).toBeGreaterThan(60);
    expect(brand.size).toBeGreaterThan(60);
  });

  it("mocks and design-system bundle: each name has assets/icons/<name>.svg", () => {
    expect(missing(asked(), assets, WAITING_FOR_DOWNLOAD)).toEqual([]);
  });

  it("the waiting list shrinks: a listed name with a file, or no longer asked for, comes off", () => {
    const names = asked();
    const stale = Object.keys(WAITING_FOR_DOWNLOAD).filter((n) => assets.has(n) || !names.has(n));
    expect(stale, "remove these from WAITING_FOR_DOWNLOAD").toEqual([]);
  });

  it("every dynamic icon binding in a mock has been read by hand (see dynamic-icon-bindings.ts)", () => {
    const known = new Set(DYNAMIC_ICON_BINDINGS.flatMap((d) => d.files.map((f) => `${f} ${d.expr}`)));
    const found = new Set(mocks.dynamic.map((d) => `${d.file} ${d.expr}`));
    const unread = [...found].filter((k) => !known.has(k));
    expect(unread, "a new {{ … }} icon name: read where its value comes from, then add it to dynamic-icon-bindings.ts").toEqual([]);
    const gone = [...known].filter((k) => !found.has(k));
    expect(gone, "no longer in the page: remove from dynamic-icon-bindings.ts").toEqual([]);
  });

  it("every value listed for a dynamic binding still appears as a quoted name in the mock sources", () => {
    // Values passed by position (card('Today', …, 'car-front')) are not icon-keyed, so look for the quoted word itself.
    const source = walkSources(join(repoRoot, "app")).map((f) => readFileSync(f, "utf8")).join("\n");
    const named = new Set(mocks.refs.map((r) => r.name));
    const gone = DYNAMIC_ICON_BINDINGS.flatMap((d) =>
      d.values.filter((v) => !named.has(v) && !source.includes(`'${v}'`) && !source.includes(`"${v}"`)).map((v) => `${d.expr}: ${v}`),
    );
    expect(gone, "a listed value that no source names any more").toEqual([]);
  });

  it("React app: the IconName union and every literal icon prop have apps/web/public/brand/icons/<name>.svg", () => {
    const names = new Map<string, string[]>();
    for (const n of react.union) names.set(n, ["apps/web/components/core/Icon.tsx (IconName)"]);
    for (const r of react.refs) names.set(r.name, [...(names.get(r.name) ?? []), `${r.file}:${r.line}`]);
    expect(missing(names, brand, REACT_WAITING_FOR_DOWNLOAD)).toEqual([]);
    const stale = Object.keys(REACT_WAITING_FOR_DOWNLOAD).filter((n) => brand.has(n) || !names.has(n));
    expect(stale).toEqual([]);
  });

  it("e-mail templates name no icon file (a mail carries the logo image only)", () => {
    const dir = join(repoRoot, "packages/emails/src");
    const sources = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));
    expect(sources.length).toBeGreaterThan(10);
    const hits = sources.filter((f) => /\/icons\/|assets\/icons|brand\/icons|mask-image/.test(readFileSync(join(dir, f), "utf8")));
    expect(hits).toEqual([]);
  });

  // Folded in from tests/unit/dc-icons-vendored.test.ts (fix/ops-toast-tone): the file the dashboard distance chip draws.
  it("route.svg is the Lucide route icon (24x24, stroke, no fill)", () => {
    const svg = readFileSync(join(assetsIcons, "route.svg"), "utf8");
    expect(svg).toMatch(/viewBox="0 0 24 24"/);
    expect(svg).toMatch(/stroke="currentColor"/);
    expect(svg).toMatch(/fill="none"/);
    expect(svg).toContain('d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"');
  });

  // `pnpm test` syncs first. Without a synced copy this shows as skipped locally and fails in CI.
  const served = join(repoRoot, "apps/web/public/assets/icons");
  const synced = existsSync(served);
  it.skipIf(!synced && !process.env.CI)("the sync copies every vendored icon to public/assets/icons", () => {
    expect(synced, "run node scripts/sync-dc-mock-to-public.mjs first").toBe(true);
    expect(vendoredIcons(served)).toEqual([...assets].sort());
  });
});
