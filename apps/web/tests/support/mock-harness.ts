// apps/web/tests/support/mock-harness.ts
//
// The comparison rig D-25 asks for, running with no network egress (D-25 as amended,
// RESEARCH's Open Question 3). One local HTTP server, rooted at the repository root,
// serves three kinds of pages for `apps/web/tests/visual/*.spec.ts`:
//
//   serveMock(mockRelPath)              — a `.dc.html` mock from `app/`, with its unpkg
//                                          React/ReactDOM/Babel <script> references
//                                          rewritten on read (never on disk — D-03 keeps
//                                          the mock tree untouched) to the locally
//                                          vendored copies in `apps/web/tests/vendor/`.
//                                          `app/support.js`'s own `window.__resources`
//                                          hook (see `tests/vendor/README.md`) is what
//                                          makes this a same-mechanism swap rather than a
//                                          parallel implementation of the mock runtime.
//
//   mountPort(componentRelPath, props)  — the React port of one component, statically
//                                          rendered server-side with the real React 19
//                                          apps/web already depends on (react-dom/server),
//                                          served with its own extracted `.css` and the
//                                          design-system token chain. The comparison
//                                          target for every ported component a mock uses.
//
//   mountBundle(componentName, props)   — one component rendered directly from
//                                          `design-system/_ds_bundle.js` (D-30,
//                                          reference-only, never shipped) inside the same
//                                          offline page, using the same vendored React/
//                                          ReactDOM copies `serveMock` uses. The
//                                          comparison target for the six components no
//                                          mock references — see
//                                          `COMPONENTS_WITHOUT_MOCK_USAGE` below.
//
// Every byte these three functions serve resolves to a file already on disk
// (design-system/, assets/, apps/web/public/brand/, apps/web/tests/vendor/) or to markup
// generated in this Node process — nothing here ever requests a package CDN.

import { createServer, type Server, type ServerResponse } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { extname, join, dirname, basename } from "node:path";
import ts from "typescript";
import * as ReactDOMServer from "react-dom/server";
import ReactActual from "react";
import type { FunctionComponent } from "react";
import type { Page } from "@playwright/test";

// Playwright compiles this file to CommonJS (apps/web/package.json has no "type": "module"),
// so __dirname is the plain CJS global, not import.meta.url — kept dependency-free on
// purpose rather than reaching for an ESM/CJS interop helper.
const here = __dirname;
// apps/web/tests/support -> repo root is three levels up.
const REPO_ROOT = join(here, "..", "..", "..", "..");
// Resolves bare specifiers ("react", etc.) the way apps/web itself would, so mountPort
// renders with the exact same React/ReactDOM the ported app ships.
const webRequire = createRequire(join(here, "..", "..", "package.json"));

/** The six ported components no `.dc.html` mock references — confirmed by a usage audit
 *  (`grep -rl 'component-from-global-scope="VamosTaxiDesignSystem_245af1.<Name>"' app/`)
 *  run during this plan's execution, matching what RESEARCH's assumption A4 flagged as
 *  needing re-checking. Named explicitly, not inferred, so a future component landing
 *  here without a mock usage is a deliberate addition to this list, not a silent one. */
export const COMPONENTS_WITHOUT_MOCK_USAGE = [
  "StatTile",
  "Tooltip",
  "DatePicker",
  "SectionHeader",
  "VehicleCard",
  "ProgressIndicator",
] as const;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};
const TEXT_EXT = new Set([".html", ".css", ".js", ".mjs", ".json", ".svg", ".txt"]);

// The exact unpkg URLs `app/support.js`'s `src/cdn.ts` pins by SRI — the keys
// `window.__resources` must carry for the runtime's own `cdnScriptFor()` to skip the
// network entirely (see tests/vendor/README.md for the matching hashes).
const VENDOR_MAP: Record<string, string> = {
  "https://unpkg.com/react@18.3.1/umd/react.production.min.js":
    "apps/web/tests/vendor/react.production.min.js",
  "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js":
    "apps/web/tests/vendor/react-dom.production.min.js",
  "https://unpkg.com/@babel/standalone@7.29.0/babel.min.js":
    "apps/web/tests/vendor/babel.min.js",
};

const DESIGN_TOKEN_HREFS = [
  "apps/web/public/brand/tokens/fonts.css",
  "apps/web/public/brand/tokens/colors.css",
  "apps/web/public/brand/tokens/typography.css",
  "apps/web/public/brand/tokens/spacing.css",
  "apps/web/public/brand/tokens/elevation.css",
  "apps/web/public/brand/tokens/motion.css",
  "apps/web/public/brand/tokens/base.css",
  "apps/web/public/brand/tokens/laws.css",
].map((p) => `/${p}`);

// ── the server ────────────────────────────────────────────────────────────────────────

let serverPromise: Promise<{ server: Server; baseUrl: string }> | null = null;
const generatedPages = new Map<string, string>();

function startServer(): Promise<{ server: Server; baseUrl: string }> {
  if (serverPromise) return serverPromise;
  serverPromise = new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      try {
        handleRequest(req.url ?? "/", res);
      } catch (err) {
        res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        res.end(String(err instanceof Error ? (err.stack ?? err.message) : err));
      }
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("mock-harness: server did not bind a TCP port"));
        return;
      }
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
  return serverPromise;
}

function handleRequest(url: string, res: ServerResponse) {
  const pathname = decodeURIComponent(url.split("?")[0] ?? "/");

  if (pathname.startsWith("/__generated__/")) {
    const id = pathname.slice("/__generated__/".length);
    const html = generatedPages.get(id);
    if (!html) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end(`mock-harness: no generated page for id "${id}"`);
      return;
    }
    res.writeHead(200, { "content-type": MIME[".html"] });
    res.end(html);
    return;
  }

  // Plan 06 addition: `/brand/...` is the site-root-relative URL Next.js's own
  // public/ folder serving produces in the real app for every asset Plan 05
  // vendored (apps/web/public/brand/**, D-10) — and the value the ported Icon/
  // Logo/CheckerMark components' FALLBACK_BASE constants point at, since (unlike
  // the mocks' page-relative "../../assets/...") those constants are what
  // actually ships (see apps/web/components/core/Icon.tsx's comment). Map it to
  // the real file location so a mountPort render of any icon/logo/pattern-bearing
  // component resolves under this harness the same way it resolves in
  // `next dev`/`next build`, rather than 404ing against a path that only exists
  // once Next's dev server does the public/ -> / remap itself.
  const relPath = pathname.startsWith("/brand/")
    ? `apps/web/public${pathname}`
    : pathname.replace(/^\/+/, "");
  const absPath = join(REPO_ROOT, relPath);
  if (!absPath.startsWith(REPO_ROOT) || !existsSync(absPath) || !statSync(absPath).isFile()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end(`mock-harness: not found: ${relPath}`);
    return;
  }

  const ext = extname(absPath).toLowerCase();
  if (ext === ".html" && absPath.endsWith(".dc.html")) {
    const raw = readFileSync(absPath, "utf8");
    res.writeHead(200, { "content-type": MIME[".html"] });
    res.end(rewriteMockHtml(raw));
    return;
  }

  res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream" });
  res.end(TEXT_EXT.has(ext) ? readFileSync(absPath, "utf8") : readFileSync(absPath));
}

/** Rewrites a mock's remote React/ReactDOM/Babel script references to the vendored local
 *  copies, on read — the file on disk is never touched (D-03). Injected as the first
 *  child of `<head>`, before `<script src="./support.js">` runs, so `window.__resources`
 *  exists before the runtime's `cdnScriptFor()` is ever called. */
function rewriteMockHtml(raw: string): string {
  const map: Record<string, string> = {};
  for (const [url, relPath] of Object.entries(VENDOR_MAP)) map[url] = `/${relPath}`;
  const injected = `<script>window.__resources = ${JSON.stringify(map)};</script>`;
  if (/<head[^>]*>/i.test(raw)) {
    return raw.replace(/<head[^>]*>/i, (m) => `${m}\n${injected}`);
  }
  // Defensive fallback — every mock under app/ has a <head>, but this must never
  // silently no-op if that ever stops being true.
  return `${injected}\n${raw}`;
}

function hashId(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 16);
}

function baseStyle(): string {
  // The same double neutralisation every .dc.html sets (CLAUDE.md, Law 01) — belt and
  // suspenders alongside laws.css's own token alias, and absolute (not the mocks'
  // depth-relative "../../assets/...") so it resolves correctly regardless of how deep
  // the generated page's own URL happens to be.
  return `:root{--vt-icon-base:"/assets/icons/";--vt-logo-base:"/assets/logo/";--vt-pattern-base:"/assets/patterns/";--vt-shadow-accent:none}
.vt-input--focus{box-shadow:none}
html,body{margin:0;background:#fff}`;
}

function wrapHtml(opts: {
  title: string;
  extraLinks?: string[];
  headExtra?: string;
  bodyHtml: string;
}): string {
  const links = [...DESIGN_TOKEN_HREFS, ...(opts.extraLinks ?? [])]
    .map((href) => `<link rel="stylesheet" href="${href}">`)
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${opts.title}</title>
${links}
<style>${baseStyle()}</style>
${opts.headExtra ?? ""}
</head>
<body>
${opts.bodyHtml}
</body>
</html>`;
}

// ── serveMock ─────────────────────────────────────────────────────────────────────────

/** Serves one `.dc.html` mock from `app/`, CDN-free, and returns its URL. `mockRelPath`
 *  is repo-root-relative, e.g. `"app/home/CookieBanner.dc.html"`. */
export async function serveMock(mockRelPath: string): Promise<string> {
  const abs = join(REPO_ROOT, mockRelPath);
  if (!existsSync(abs)) throw new Error(`mock-harness: no mock at ${mockRelPath}`);
  const { baseUrl } = await startServer();
  return `${baseUrl}/${mockRelPath.replace(/^\/+/, "")}`;
}

/** Waits for a served page to be genuinely ready to screenshot: fonts loaded (UI-SPEC's
 *  own flagged single most likely source of flake in this stack — self-hosted, so
 *  deterministic once actually waited for), and — mock pages only — the static
 *  `#vt-boot-cover` overlay (every `.dc.html`'s own anti-flash-of-unstyled-content cover,
 *  `app/pages/SiteHeader.dc.html`'s comment explains it) detached from the DOM.
 *  `vamos-page-transition.js` removes that cover itself, normally within two animation
 *  frames, with a 400ms `setTimeout` fallback — comfortably inside this wait's timeout,
 *  but real enough (Babel-transpiling the mock's own template in-browser on a cold
 *  context is not instant) that skipping this wait intermittently screenshots the cover
 *  instead of the content underneath it. A generated `mountPort`/`mountBundle` page never
 *  has this element, so the wait is a same-tick no-op there. */
export async function waitForMockReady(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page
    .locator("#vt-boot-cover")
    .waitFor({ state: "detached", timeout: 5000 })
    .catch(() => {});
  // Entrance animations (e.g. CookieBanner's `[data-ck-sheet]` fade/slide-in,
  // `@keyframes ck-in`) can still be mid-flight once the boot cover is gone and fonts
  // are loaded — a screenshot taken mid-animation captures a half-opacity, half-offset
  // frame that reads as "blank" or "misplaced," not a real diff. `expect().
  // toHaveScreenshot()`'s own `animations: 'disabled'` only forces animations already
  // registered at capture time to their end state; one whose element mounts a beat
  // later (a React effect resolving after this promise settles) can still race it.
  // Waiting for every currently-registered Web Animation to finish, twice with a short
  // gap so a late-registering animation gets a second pass, catches both cases without
  // a fixed guess-a-number sleep.
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() =>
      Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))),
    );
    await page.waitForTimeout(50);
  }
  // Belt-and-suspenders floor: even after every value above reads as settled (fonts
  // ready, cover detached, computed opacity/transform at rest, zero in-flight Web
  // Animations), a screenshot taken immediately can still capture a frame the
  // compositor has not actually presented yet under Playwright's headless Chromium —
  // observed directly during this plan's execution (DOM/CSSOM state fully correct,
  // captured pixels still blank). `vamos-page-transition.js`'s own comment already
  // documents "rAF is suspended in a hidden document" as a known quirk in this exact
  // stack. Two rAF round-trips plus a short fixed wait closes the gap in practice;
  // this is a pragmatic floor, not a substitute for the semantic waits above it.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.waitForTimeout(250);
}

// ── mountPort ─────────────────────────────────────────────────────────────────────────

const tsModuleCache = new Map<string, Record<string, unknown>>();

/** Transpiles and executes one `.tsx`/`.ts` component module with the TypeScript compiler
 *  API's single-file transpile (`typescript` is already a devDependency — no new package
 *  for this), classic JSX (`React.createElement`, `React` supplied as an explicit
 *  parameter rather than relying on an implicit import), and a minimal CommonJS `require`
 *  shim: `.css` imports no-op (the caller links the extracted stylesheet directly),
 *  relative `.ts`/`.tsx` imports resolve and transpile recursively, everything else
 *  resolves through apps/web's own `node_modules` so the render uses the exact React/
 *  ReactDOM the ported app ships. */
function loadTsModule(absPath: string): Record<string, unknown> {
  const cached = tsModuleCache.get(absPath);
  if (cached) return cached;

  const source = readFileSync(absPath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    fileName: absPath,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });

  const moduleObj: { exports: Record<string, unknown> } = { exports: {} };
  // Placeholder set before execution so a circular import resolves to the in-progress
  // (possibly incomplete) exports object rather than recursing forever.
  tsModuleCache.set(absPath, moduleObj.exports);

  const localRequire = (spec: string): unknown => {
    if (spec.endsWith(".css")) return {};
    if (spec.startsWith(".")) return loadTsModule(resolveLocal(dirname(absPath), spec));
    return webRequire(spec);
  };

  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- controlled, in-repo
  // source only (never user input); this is the same "transpile at test time" trick
  // `app/support.js`'s own `x-import` mechanism uses for the mock tree (`new Function`).
  const fn = new Function(
    "React",
    "exports",
    "require",
    "module",
    "__filename",
    "__dirname",
    outputText,
  );
  fn(ReactActual, moduleObj.exports, localRequire, moduleObj, absPath, dirname(absPath));
  tsModuleCache.set(absPath, moduleObj.exports);
  return moduleObj.exports;
}

function resolveLocal(fromDir: string, spec: string): string {
  const base = join(fromDir, spec);
  for (const ext of ["", ".tsx", ".ts"]) {
    if (existsSync(base + ext) && statSync(base + ext).isFile()) return base + ext;
  }
  throw new Error(`mock-harness: cannot resolve local import "${spec}" from ${fromDir}`);
}

/** Renders the React port of one component with one prop set, statically (no hydration
 *  needed — Playwright drives real `:hover`/`:focus-visible`/`:active` pseudo-classes in
 *  the browser for the interaction states none of these components need live event
 *  handlers to express), and returns its URL. `componentRelPath` is repo-root-relative,
 *  e.g. `"apps/web/components/core/Button.tsx"`; the exported component name is the
 *  file's own basename (`Button.tsx` -> `Button`), matching this codebase's convention. */
export async function mountPort(
  componentRelPath: string,
  props: Record<string, unknown> = {},
): Promise<string> {
  const abs = join(REPO_ROOT, componentRelPath);
  if (!existsSync(abs)) throw new Error(`mock-harness: no component at ${componentRelPath}`);

  const mod = loadTsModule(abs);
  const exportName = basename(componentRelPath).replace(/\.tsx?$/, "");
  const Component = (mod[exportName] ?? mod.default) as
    | FunctionComponent<Record<string, unknown>>
    | undefined;
  if (typeof Component !== "function") {
    throw new Error(
      `mock-harness: ${componentRelPath} has no export named "${exportName}" or "default"`,
    );
  }

  const markup = ReactDOMServer.renderToStaticMarkup(
    ReactActual.createElement(Component, props),
  );

  // The CSS-extraction recipe (D-24 amended) always places a component's stylesheet
  // beside it under the same basename.
  const cssRelPath = componentRelPath.replace(/\.tsx?$/, ".css");
  const cssAbs = join(REPO_ROOT, cssRelPath);
  const extraLinks = existsSync(cssAbs) ? [`/${cssRelPath}`] : [];

  const html = wrapHtml({
    title: `mountPort: ${componentRelPath}`,
    extraLinks,
    bodyHtml: `<div id="root">${markup}</div>`,
  });

  const id = `port-${hashId(componentRelPath + JSON.stringify(props))}`;
  generatedPages.set(id, html);
  const { baseUrl } = await startServer();
  return `${baseUrl}/__generated__/${id}`;
}

// ── mountBundle ───────────────────────────────────────────────────────────────────────

/** Renders one component directly from `design-system/_ds_bundle.js` (D-30, reference
 *  only) in a real browser tab, using the vendored React/ReactDOM UMD copies — the
 *  comparison target for `COMPONENTS_WITHOUT_MOCK_USAGE`. Client-side, not server-side
 *  (unlike `mountPort`): the bundle is a `window`-attached UMD build that expects
 *  `window.React`/`window.ReactDOM` as globals and calls its own `injectStyles()` at
 *  render time — the same mechanism every `.dc.html` mock already relies on. */
export async function mountBundle(
  componentName: string,
  props: Record<string, unknown> = {},
): Promise<string> {
  const propsJson = JSON.stringify(props ?? {});
  const boot = `
window.addEventListener('DOMContentLoaded', function () {
  var ns = window.VamosTaxiDesignSystem_245af1 || {};
  var C = ns[${JSON.stringify(componentName)}];
  if (!C) {
    document.body.innerHTML =
      '<pre style="color:red">mountBundle: no component "' + ${JSON.stringify(componentName)} +
      '" on window.VamosTaxiDesignSystem_245af1</pre>';
    return;
  }
  var root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(React.createElement(C, ${propsJson}));
});`;

  const scripts = [
    `/${VENDOR_MAP["https://unpkg.com/react@18.3.1/umd/react.production.min.js"]}`,
    `/${VENDOR_MAP["https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js"]}`,
    "/design-system/_ds_bundle.js",
  ]
    .map((src) => `<script src="${src}"></script>`)
    .join("\n");

  const html = wrapHtml({
    title: `mountBundle: ${componentName}`,
    headExtra: `${scripts}\n<script>${boot}</script>`,
    bodyHtml: `<div id="root"></div>`,
  });

  const id = `bundle-${hashId(componentName + propsJson)}`;
  generatedPages.set(id, html);
  const { baseUrl } = await startServer();
  return `${baseUrl}/__generated__/${id}`;
}

/** Stops the harness's local server. Not required between tests (the server is a
 *  singleton, cheap to keep alive for the whole run) — exposed for a global teardown
 *  hook that wants a clean process exit. */
export async function stopHarnessServer(): Promise<void> {
  if (!serverPromise) return;
  const { server } = await serverPromise;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  serverPromise = null;
  generatedPages.clear();
}
