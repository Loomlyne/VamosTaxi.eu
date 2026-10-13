// apps/web/lib/translate/boundary.test.ts
//
// Phase 32 plan 05: where the model may be called and what a translate queue message may carry, fenced
// by a static scan (F-06: no model call in a public page view or an e-mail render; T-32-21: ids only on
// the queue; D-04: never AI Gateway). Walks apps/web/app, apps/web/lib, middleware.ts, worker.ts and
// packages/emails/src (no node_modules, .next, .open-next; test files skipped except where noted).
// Allowlisted files that do not exist yet are tolerated (plans 07/08 add them in the same wave).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const WEB = join(here, "..", "..");
const REPO = join(WEB, "..", "..");

const SKIP_DIRS = Object.freeze(["node_modules", ".next", ".open-next", ".turbo", "test-results"]);
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const TEST = /\.(test|spec)\.(ts|tsx|js|mjs)$|(^|\/)ai-stub\.ts$/;

/** Repo-relative path with forward slashes. */
function rel(abs: string): string {
  return relative(REPO, abs).split(sep).join("/");
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.includes(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (CODE.test(name)) out.push(p);
  }
  return out;
}

const ROOTS = [join(WEB, "app"), join(WEB, "lib"), join(REPO, "packages", "emails", "src")];
const SINGLE = [join(WEB, "middleware.ts"), join(WEB, "worker.ts")].filter((f) => existsSync(f));
const ALL_FILES = [...ROOTS.flatMap((r) => walk(r)), ...SINGLE];
const SOURCE_FILES = ALL_FILES.filter((f) => !TEST.test(rel(f)));

/** Code with comments removed (string and template literals kept intact). */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    const n = src[i + 1];
    if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") i += 1;
    } else if (c === "/" && n === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2;
    } else if (c === '"' || c === "'" || c === "`") {
      const q = c;
      out += c;
      i += 1;
      while (i < src.length && src[i] !== q) {
        if (src[i] === "\\") {
          out += src[i]! + (src[i + 1] ?? "");
          i += 2;
          continue;
        }
        if (q !== "`" && src[i] === "\n") break;
        out += src[i]!;
        i += 1;
      }
      out += src[i] ?? "";
      i += 1;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

const cache = new Map<string, string>();
function code(file: string): string {
  let v = cache.get(file);
  if (v === undefined) {
    v = stripComments(readFileSync(file, "utf8"));
    cache.set(file, v);
  }
  return v;
}

const SPEC = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;

/** Import specifiers of a file. */
function specifiers(file: string): string[] {
  const out: string[] = [];
  for (const m of code(file).matchAll(SPEC)) out.push(m[1]!);
  return out;
}

const EXTS = Object.freeze(["", ".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx", "/index.js"]);

/** Resolves a relative or `@/` specifier to a file, or null for a package. */
function resolve(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(WEB, spec.slice(2));
  else if (spec.startsWith(".")) base = join(dirname(from), spec);
  else return null;
  for (const ext of EXTS) {
    const p = base + ext;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return base;
}

function imports(file: string): string[] {
  return specifiers(file)
    .map((s) => resolve(file, s))
    .filter((p): p is string => p !== null);
}

const TRANSLATOR = join(WEB, "lib", "translate", "translate.ts");
const TRANSLATE_DIR = join(WEB, "lib", "translate") + sep;

/** Every repo file reachable from `file` through relative or `@/` imports. */
function closure(file: string): Set<string> {
  const seen = new Set<string>();
  const stack = [file];
  while (stack.length > 0) {
    const f = stack.pop()!;
    if (seen.has(f) || !existsSync(f) || !CODE.test(f)) continue;
    seen.add(f);
    for (const dep of imports(f)) if (!seen.has(dep)) stack.push(dep);
  }
  return seen;
}

/** Files allowed to import the engine or call it (plans 01, 06, 07, 08). */
const ENGINE_CALLERS = Object.freeze([
  "apps/web/lib/ops/extra-label-translate.ts",
  "apps/web/app/[locale]/(ops)/api/staff/tickets/[id]/reply-translate/route.ts",
  "apps/web/app/api/reviews/[ref]/translation/route.ts",
]);

/** Files allowed to read the Workers AI binding. */
const AI_READERS = Object.freeze([
  "apps/web/worker.ts",
  "apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts",
  "apps/web/app/[locale]/(ops)/api/staff/tickets/[id]/reply-translate/route.ts",
  "apps/web/app/api/reviews/[ref]/translation/route.ts",
]);

function inTranslateDir(file: string): boolean {
  return file.startsWith(TRANSLATE_DIR);
}

describe("translator boundary (F-06, D-04, T-32-21)", () => {
  it("walks a real tree", () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(200);
    expect(SOURCE_FILES).toContain(TRANSLATOR);
  });

  it("(a) only lib/translate and the allowlisted server modules import or call the engine", () => {
    const offenders: string[] = [];
    for (const file of SOURCE_FILES) {
      if (inTranslateDir(file) || ENGINE_CALLERS.includes(rel(file))) continue;
      const importsEngine = imports(file).includes(TRANSLATOR);
      const callsEngine = /\btranslate(Text|Unknown)\s*\(/.test(code(file));
      if (importsEngine || callsEngine) offenders.push(rel(file));
    }
    expect(offenders).toEqual([]);
  });

  it("(b) only translate.ts runs TRANSLATE_MODEL; only allowlisted files read the AI binding", () => {
    const runners = SOURCE_FILES.filter((f) => /\bTRANSLATE_MODEL\b/.test(code(f)) && /\.run\s*\(/.test(code(f))).map(rel);
    expect(runners).toEqual(["apps/web/lib/translate/translate.ts"]);
    const readers = SOURCE_FILES.filter((f) => /\.AI\b/.test(code(f))).map(rel);
    for (const r of readers) expect(AI_READERS).toContain(r);
  });

  it("(c) no page, layout, middleware, public reviews list or e-mail render imports lib/translate", () => {
    const fenced = SOURCE_FILES.filter((f) => {
      const r = rel(f);
      return (
        /\/(page|layout)\.(tsx|ts|jsx|js)$/.test(r) ||
        r === "apps/web/middleware.ts" ||
        r === "apps/web/app/api/reviews/route.ts" ||
        r.startsWith("packages/emails/src/")
      );
    });
    expect(fenced.length).toBeGreaterThan(10);
    const direct: string[] = [];
    const reachesModel: string[] = [];
    for (const file of fenced) {
      if (imports(file).some((p) => p.startsWith(TRANSLATE_DIR))) direct.push(rel(file));
      if (closure(file).has(TRANSLATOR)) reachesModel.push(rel(file));
    }
    expect(direct).toEqual([]);
    expect(reachesModel).toEqual([]);
  });

  it("(d) TRANSLATE_QUEUE.send appears only in jobs-contract.ts (ids-only producer)", () => {
    const senders = SOURCE_FILES.filter((f) => /\bTRANSLATE_QUEUE\s*\??\.\s*send\b/.test(code(f))).map(rel);
    for (const s of senders) expect(s).toBe("apps/web/lib/translate/jobs-contract.ts");
    // Any file touching the binding at all: the producer, the sweep's presence check, the env type.
    const touching = SOURCE_FILES.filter((f) => /\bTRANSLATE_QUEUE\b/.test(code(f))).map(rel).sort();
    for (const t of touching) {
      expect(["apps/web/lib/env.d.ts", "apps/web/lib/translate/jobs-contract.ts", "apps/web/lib/translate/sweep.ts"]).toContain(t);
    }
    expect(touching).toContain("apps/web/lib/translate/jobs-contract.ts");
  });

  it("(e) nothing under lib/translate mentions a gateway outside comments", () => {
    const hits = SOURCE_FILES.filter((f) => inTranslateDir(f) && /gateway/i.test(code(f))).map(rel);
    expect(hits).toEqual([]);
  });

  it("(f) the retired m2m100 model id appears nowhere (tests included)", () => {
    const retired = ["@cf", "meta", "m2m100"].join("/");
    const hits = ALL_FILES.filter((f) => readFileSync(f, "utf8").includes(retired)).map(rel);
    expect(hits).toEqual([]);
  });
});
