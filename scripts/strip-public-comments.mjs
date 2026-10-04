/**
 * Strip developer comments from the public copy of the DC mock (apps/web/public/app).
 *
 * The sources keep their comments. Only the copy the Worker serves is stripped, so a
 * visitor who opens view-source or fetches /app/*.js sees code, not internal notes.
 *
 * Kept on purpose: license notices (`/*!`, `@license`, `@preserve`), everything inside
 * strings, template literals and regex literals, JSON-LD and other non-JS script types.
 * Every function is pure and returns the input unchanged when it holds no comment.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const KEEP = /^\/\*!|@license|@preserve/;

// After one of these keywords a `/` starts a regex literal, not a division.
const REGEX_AFTER_WORD = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw",
  "case", "do", "else", "yield", "await",
]);

/**
 * Remove `//` and `/* *\/` comments from JavaScript source.
 * A comment is replaced by nothing (line comment) or by one space / its newlines
 * (block comment), so tokens never fuse and line numbers in stack traces stay close.
 */
export function stripJs(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  // What came last, to tell regex from division: "value" (ident, number, ), ], }) or "op".
  let last = "op";
  let lastWord = "";
  // Template literal nesting: each entry is the brace depth at which `${` was opened.
  const tpl = [];
  let depth = 0;

  const readString = (q) => {
    let j = i + 1;
    while (j < n && src[j] !== q) {
      if (src[j] === "\\") j += 1;
      else if (src[j] === "\n" && q !== "`") break;
      j += 1;
    }
    return j + 1;
  };

  // Scan template text from i (just after ` or }), return index after the closing ` or after `${`.
  const readTemplate = (start) => {
    let j = start;
    while (j < n) {
      if (src[j] === "\\") { j += 2; continue; }
      if (src[j] === "`") return { end: j + 1, open: false };
      if (src[j] === "$" && src[j + 1] === "{") return { end: j + 2, open: true };
      j += 1;
    }
    return { end: n, open: false };
  };

  while (i < n) {
    const c = src[i];
    const d = src[i + 1];

    if (c === "/" && d === "/") {
      let j = i + 2;
      while (j < n && src[j] !== "\n" && src[j] !== "\r") j += 1;
      i = j;
      continue;
    }
    if (c === "/" && d === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      const body = src.slice(i, stop);
      if (KEEP.test(body)) {
        out += body;
      } else {
        const nl = body.match(/\n/g);
        out += nl ? nl.join("") : " ";
      }
      i = stop;
      continue;
    }
    if (c === "'" || c === '"') {
      const j = readString(c);
      out += src.slice(i, j);
      i = j;
      last = "value";
      lastWord = "";
      continue;
    }
    if (c === "`") {
      const r = readTemplate(i + 1);
      out += src.slice(i, r.end);
      i = r.end;
      if (r.open) { tpl.push(depth); last = "op"; } else last = "value";
      lastWord = "";
      continue;
    }
    if (c === "/") {
      const isRegex = last === "op" || REGEX_AFTER_WORD.has(lastWord);
      if (isRegex) {
        let j = i + 1;
        let cls = false;
        while (j < n) {
          const ch = src[j];
          if (ch === "\\") { j += 2; continue; }
          if (ch === "\n") break;
          if (cls) { if (ch === "]") cls = false; }
          else if (ch === "[") cls = true;
          else if (ch === "/") break;
          j += 1;
        }
        j += 1;
        while (j < n && /[a-z]/i.test(src[j])) j += 1;
        out += src.slice(i, j);
        i = j;
        last = "value";
        lastWord = "";
        continue;
      }
      out += c;
      i += 1;
      last = "op";
      lastWord = "";
      continue;
    }
    if (/[A-Za-z_$\u0080-￿]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_$\u0080-￿]/.test(src[j])) j += 1;
      lastWord = src.slice(i, j);
      out += lastWord;
      i = j;
      last = "value";
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(d ?? ""))) {
      let j = i + 1;
      while (j < n && /[0-9A-Za-z_.]/.test(src[j])) j += 1;
      out += src.slice(i, j);
      i = j;
      last = "value";
      lastWord = "";
      continue;
    }
    if (c === "{") { depth += 1; out += c; i += 1; last = "op"; lastWord = ""; continue; }
    if (c === "}") {
      if (tpl.length && tpl[tpl.length - 1] === depth) {
        tpl.pop();
        const r = readTemplate(i + 1);
        out += src.slice(i, r.end);
        i = r.end;
        if (r.open) { tpl.push(depth); last = "op"; } else last = "value";
        lastWord = "";
        continue;
      }
      depth -= 1;
      out += c;
      i += 1;
      last = "value";
      lastWord = "";
      continue;
    }
    if (c === ")" || c === "]") { out += c; i += 1; last = "value"; lastWord = ""; continue; }
    if (/\s/.test(c)) { out += c; i += 1; continue; }
    out += c;
    i += 1;
    last = "op";
    lastWord = "";
  }
  return out;
}

/** Remove `/* *\/` comments from CSS, leaving strings untouched. */
export function stripCss(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== "\n") { if (src[j] === "\\") j += 1; j += 1; }
      out += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      const body = src.slice(i, stop);
      out += KEEP.test(body) ? body : " ";
      i = stop;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

const JS_TYPES = new Set(["", "text/javascript", "application/javascript", "module", "text/x-dc", "text/babel"]);

/** Read a start tag from `<` at i, honouring quoted attribute values; returns the index after `>`. */
function tagEnd(src, i) {
  let j = i + 1;
  let q = "";
  while (j < src.length) {
    const ch = src[j];
    if (q) { if (ch === q) q = ""; }
    else if (ch === '"' || ch === "'") q = ch;
    else if (ch === ">") return j + 1;
    j += 1;
  }
  return src.length;
}

/**
 * Strip an HTML (or .dc.html) document: `<!-- -->` comments in markup, JS comments in
 * script blocks of a JS type, CSS comments in style blocks. Attribute values, text and
 * non-JS scripts (JSON-LD) are left exactly as they are.
 */
export function stripHtml(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    if (src.startsWith("<!--", i)) {
      const end = src.indexOf("-->", i + 4);
      i = end === -1 ? n : end + 3;
      continue;
    }
    const m = /^<(script|style)\b/i.exec(src.slice(i, i + 8));
    if (m) {
      const open = tagEnd(src, i);
      const tag = src.slice(i, open);
      const name = m[1].toLowerCase();
      const close = src.toLowerCase().indexOf(`</${name}`, open);
      const stop = close === -1 ? n : close;
      const body = src.slice(open, stop);
      let next = body;
      if (name === "style") next = stripCss(body);
      else {
        const type = (/\stype\s*=\s*["']?([^"'\s>]+)/i.exec(tag)?.[1] ?? "").toLowerCase();
        if (JS_TYPES.has(type)) next = stripJs(body);
      }
      out += tag + next;
      i = stop;
      if (close !== -1) {
        const after = tagEnd(src, close);
        out += src.slice(close, after);
        i = after;
      }
      continue;
    }
    out += src[i];
    i += 1;
  }
  return out;
}

/**
 * Strip every .dc.html / .html / .js file under dir in place. Files named in `skip`
 * (vendor runtimes) and folders named in `skipDirs` are left alone. `ops/` is skipped:
 * the public host answers 404 there (the dashboard Worker serves it behind sign-in), and
 * its tests pin the public copy byte-equal to the source. Returns the paths that changed.
 */
export function stripTree(dir, skip = new Set(["support.js"]), skipDirs = new Set(["ops"])) {
  const changed = [];
  const walk = (d, rel) => {
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, ent.name);
      const r = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) { if (!(rel === "" && skipDirs.has(ent.name))) walk(p, r); continue; }
      if (skip.has(ent.name)) continue;
      let fn = null;
      if (ent.name.endsWith(".html")) fn = stripHtml;
      else if (ent.name.endsWith(".js")) fn = stripJs;
      if (!fn) continue;
      const src = readFileSync(p, "utf8");
      const next = fn(src);
      if (next !== src) { writeFileSync(p, next); changed.push(r); }
    }
  };
  walk(dir, "");
  return changed;
}
