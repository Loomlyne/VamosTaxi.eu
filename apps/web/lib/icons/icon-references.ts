// Every place a screen names an icon, read straight from the sources (no build, no browser).
// The mocks (`app/**`, the design-system bundle) draw icons as CSS masks over `assets/icons/<name>.svg`;
// the React app does the same over `apps/web/public/brand/icons/<name>.svg`. A name with no file
// draws nothing, with no error anywhere (the dashboard distance chip asked for `route`, 2026-10-04).
// `icon-files-exist.test.ts` fails on such a name; this module only finds the names.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

export type IconRef = {
  name: string;
  /** Path from the repo root, forward slashes. */
  file: string;
  line: number;
  /** How the name was found: attr (tag attribute), meta, script (icon-keyed literal), bundle, react. */
  via: "attr" | "meta" | "script" | "bundle" | "react" | "url";
};

export type DynamicIconBinding = {
  file: string;
  line: number;
  tag: string;
  attr: string;
  /** The `{{ … }}` expression without the braces. */
  expr: string;
};

const SKIP_DIRS = new Set(["node_modules", ".git", ".open-next", ".turbo"]);
const KEBAB = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
// A property or variable that carries an icon name: icon, iconEnd, endIcon, floatIcon, FIELD_ICONS, glyph, chevron.
const KEY =
  /(?<![\w$-])(?:[\w$]*(?:[iI]cons?|ICONS?|[gG]lyph|GLYPH|[cC]hevron|CHEVRON)|icon[A-Z][\w$]*)(?![\w$])(?:\s*(?:\|\||\?\?)\s*|\s*:\s*|\s*=(?![=>])\s*)/g;
// An attribute that carries an icon name on a mock tag.
const ICON_ATTR = /^(?:icon|[a-z]+Icon|icon[A-Z]\w*)$/;
const TAG = /<([a-zA-Z][\w:-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTR = /\s([a-zA-Z_:][\w:.-]*)=(?:"([^"]*)"|'([^']*)')/g;

function walk(dir: string, accept: (file: string) => boolean, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name) || e.name.startsWith(".next")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, accept, out);
    else if (accept(p)) out.push(p);
  }
  return out;
}

function lineAt(text: string, index: number): number {
  let n = 1;
  for (let i = text.indexOf("\n"); i !== -1 && i < index; i = text.indexOf("\n", i + 1)) n++;
  return n;
}

/** The expression after an icon-keyed property: up to a depth-0 `,` `;` newline or closing bracket. */
function expressionAfter(text: string, from: number): string {
  let depth = 0;
  let quote: string | null = null;
  let i = from;
  for (; i < text.length && i - from < 600; i++) {
    const c = text[i] as string;
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      if (depth === 0) break;
      depth--;
    } else if ((c === "," || c === ";" || c === "\n") && depth === 0) break;
  }
  return text.slice(from, i);
}

/** Whole string literals of an expression that read as an icon name, minus the ones compared with `===`. */
function literalsIn(expr: string): string[] {
  const out: string[] = [];
  let last = "";
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i] as string;
    if (c !== '"' && c !== "'" && c !== "`") {
      if (!/\s/.test(c)) last = (last + c).slice(-3);
      continue;
    }
    let j = i + 1;
    while (j < expr.length && expr[j] !== c) j += expr[j] === "\\" ? 2 : 1;
    const word = expr.slice(i + 1, j);
    if (KEBAB.test(word) && !/[=!]==?$/.test(last)) out.push(word);
    last = c;
    i = j;
  }
  return out;
}

/** Icon-keyed literals in script text: `icon: 'x'`, `chevron: open ? 'a' : 'b'`, `FIELD_ICONS = { id: 'receipt' }`. */
function scriptLiterals(text: string, file: string, base: number, whole: string, via: IconRef["via"]): IconRef[] {
  const refs: IconRef[] = [];
  for (const m of text.matchAll(KEY)) {
    const expr = expressionAfter(text, m.index + m[0].length);
    for (const name of literalsIn(expr)) refs.push({ name, file, line: lineAt(whole, base + m.index), via });
  }
  return refs;
}

function dcScripts(html: string): Array<{ offset: number; code: string }> {
  const blocks: Array<{ offset: number; code: string }> = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\ssrc=/.test(m[1] ?? "")) continue;
    blocks.push({ offset: m.index + m[0].indexOf(">") + 1, code: m[2] ?? "" });
  }
  return blocks;
}

export type MockScan = { refs: IconRef[]; dynamic: DynamicIconBinding[] };

/** The DC mocks: every `.dc.html` page and component plus the `app/*.js` stores. */
export function scanMocks(repoRoot: string): MockScan {
  const refs: IconRef[] = [];
  const dynamic: DynamicIconBinding[] = [];
  const files = walk(join(repoRoot, "app"), (f) => /\.(html|js)$/.test(f));
  for (const abs of files) {
    const file = relative(repoRoot, abs).split("\\").join("/");
    const text = readFileSync(abs, "utf8");
    if (abs.endsWith(".js")) {
      refs.push(...scriptLiterals(text, file, 0, text, "script"));
      continue;
    }
    for (const t of text.matchAll(TAG)) {
      const attrs = t[2] ?? "";
      const tag = t[1] as string;
      if (tag === "meta") {
        const meta = /\bname="ext-resource-dependency"[^>]*\bcontent="[^"]*\/icons\/([a-z0-9-]+)\.svg"/.exec(attrs);
        if (meta) refs.push({ name: meta[1] as string, file, line: lineAt(text, t.index), via: "meta" });
        continue;
      }
      const isIconComponent = tag === "x-import" && /component-from-global-scope="[^"]*\.Icon"/.test(attrs);
      for (const a of attrs.matchAll(ATTR)) {
        const attr = a[1] as string;
        if (!(isIconComponent && attr === "name") && !ICON_ATTR.test(attr)) continue;
        const value = a[2] ?? a[3] ?? "";
        const line = lineAt(text, t.index);
        if (value.includes("{{")) {
          dynamic.push({ file, line, tag: isIconComponent ? "Icon" : tag, attr, expr: value.replace(/^\s*\{\{\s*|\s*\}\}\s*$/g, "") });
        } else if (value !== "") {
          refs.push({ name: value, file, line, via: "attr" });
        }
      }
    }
    for (const b of dcScripts(text)) refs.push(...scriptLiterals(b.code, file, b.offset, text, "script"));
  }
  return { refs, dynamic };
}

/** The design-system bundle: the names its own components draw (Alert/Toast glyphs, status badges, defaults, close buttons). */
export function scanBundle(repoRoot: string): IconRef[] {
  const file = "design-system/_ds_bundle.js";
  const text = readFileSync(join(repoRoot, file), "utf8");
  const refs: IconRef[] = [];
  // Only the Vamos (Lucide) components; the mobile Rolic glyph set is inline SVG and never reads assets/icons.
  const marks = [...text.matchAll(/^\/\/ components\/(\w+)\/[\w/]+\.(?:jsx|js)$/gm)];
  for (const [i, m] of marks.entries()) {
    if (!["core", "data", "feedback", "forms", "navigation", "transfer"].includes(m[1] as string)) continue;
    const end = i + 1 < marks.length ? (marks[i + 1] as RegExpMatchArray).index : text.length;
    const seg = text.slice(m.index, end);
    refs.push(...scriptLiterals(seg, file, m.index, text, "bundle"));
    for (const n of seg.matchAll(/__ds_scope\.Icon,\s*\{\s*name:\s*(["'])([^"']+)\1/g)) {
      refs.push({ name: n[2] as string, file, line: lineAt(text, m.index + (n.index ?? 0)), via: "bundle" });
    }
  }
  return refs;
}

export type ReactScan = { union: string[]; refs: IconRef[] };

/** The React app: the closed `IconName` union plus every literal handed to an icon prop. */
export function scanReact(repoRoot: string): ReactScan {
  const iconTsx = readFileSync(join(repoRoot, "apps/web/components/core/Icon.tsx"), "utf8");
  const unionText = /export type IconName =([\s\S]*?);/.exec(iconTsx)?.[1] ?? "";
  const union = [...unionText.matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1] as string);
  const refs: IconRef[] = [];
  const roots = ["app", "components", "lib"].map((d) => join(repoRoot, "apps/web", d));
  const files = roots
    .flatMap((r) => walk(r, (f) => /\.(ts|tsx)$/.test(f) && !/\.(test|spec)\.tsx?$/.test(f)))
    .filter((f) => !f.includes(`${join("apps/web/lib/icons")}/`));
  for (const abs of files) {
    const file = relative(repoRoot, abs).split("\\").join("/");
    const text = readFileSync(abs, "utf8");
    for (const m of text.matchAll(KEY)) {
      const at = m.index + m[0].length;
      const isAttr = /=\s*$/.test(m[0]) && !/:\s*$/.test(m[0]);
      let expr: string;
      if (isAttr) {
        // JSX attribute: icon="x" or icon={…}; never read on into the next attribute.
        if (text[at] === '"') expr = text.slice(at, text.indexOf('"', at + 1) + 1);
        else if (text[at] === "{") expr = expressionAfter(text, at + 1);
        else continue;
      } else {
        expr = expressionAfter(text, at);
      }
      for (const name of literalsIn(expr)) refs.push({ name, file, line: lineAt(text, m.index), via: "react" });
    }
    // <Icon name="x" /> and <Icon name={open ? "a" : "b"} />: typed as IconName, read here so the file is checked too.
    for (const m of text.matchAll(/<Icon\b[^>]*?\bname=/g)) {
      const at = m.index + m[0].length;
      let expr = "";
      if (text[at] === '"') expr = text.slice(at, text.indexOf('"', at + 1) + 1);
      else if (text[at] === "{") expr = expressionAfter(text, at + 1);
      for (const name of literalsIn(expr)) refs.push({ name, file, line: lineAt(text, m.index), via: "react" });
    }
    for (const u of text.matchAll(/(?:\/|["'(])(?:brand|assets)\/icons\/([a-z0-9-]+)\.svg/g)) {
      refs.push({ name: u[1] as string, file, line: lineAt(text, u.index ?? 0), via: "url" });
    }
  }
  return { union, refs };
}

/** File names (without `.svg`) in an icon folder. */
export function vendoredIcons(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".svg"))
    .map((f) => f.slice(0, -4))
    .sort();
}
