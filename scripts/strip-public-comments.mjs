/**
 * Strip developer comments from the public copy of the DC mock (apps/web/public/app).
 *
 * The sources keep their comments. Only the copy the Worker serves is stripped, so a
 * visitor who opens view-source or fetches /app/*.js sees code, not internal notes.
 *
 * Every stripped script is proven by acorn (same tokens, no comment left) or the sync stops.
 * Kept on purpose: license notices (`/*!`, `@license`, `@preserve`), everything inside
 * strings, template literals and regex literals, JSON-LD and other non-JS script types.
 * Every function is pure and returns the input unchanged when it holds no comment.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as acorn from "acorn";

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

/** Tokens acorn reads from a script, plus every comment that is not a licence notice. */
function readTokens(src) {
  const left = [];
  const tokens = [];
  const opts = {
    ecmaVersion: "latest",
    sourceType: "script",
    allowReturnOutsideFunction: true,
    allowHashBang: true,
    onComment: (_block, text) => { if (!/^!|@license|@preserve/.test(text)) left.push(text); },
  };
  // A full parse, not just the tokenizer: JSX tokenizes "fine" (`<div>// y` reads as a
  // comparison and a comment) but does not parse, and must then be left alone.
  acorn.parse(src, { ...opts, onToken: (t) => { tokens.push(`${t.type.label}\u0000${tokenValue(t.value)}`); } });
  return { tokens: tokens.join("\u0001"), left };
}

/**
 * A token's value as text. A regex token's value is an object ({ pattern, flags, value }), which
 * would read as "[object Object]" for every regex and let a changed regex pass the proof.
 */
function tokenValue(value) {
  if (value == null) return "";
  if (typeof value === "object" && typeof value.pattern === "string") return `/${value.pattern}/${value.flags ?? ""}`;
  return String(value);
}

/**
 * stripJs, proven: acorn must read the same tokens before and after, and no non-licence
 * comment may remain. A script acorn cannot read at all (JSX, a syntax error that already
 * ships) is returned unchanged rather than guessed at. Any difference throws, so the sync
 * (and every build and deploy that runs it) stops instead of serving changed code.
 */
export function stripJsChecked(src, where = "script") {
  let before;
  try { before = readTokens(src); } catch { return src; }
  if (before.left.length === 0) return src;
  const out = stripJs(src);
  let after;
  try { after = readTokens(out); } catch (e) {
    throw new Error(`strip-public-comments: ${where} no longer parses after stripping (${e.message})`);
  }
  if (after.tokens !== before.tokens) throw new Error(`strip-public-comments: ${where} tokens changed by stripping`);
  if (after.left.length) throw new Error(`strip-public-comments: ${where} still has a comment: ${after.left[0].slice(0, 60)}`);
  return out;
}

// Elements whose content is raw text: never look for markup or comments inside them.
const RAW_TEXT = new Set(["script", "style", "textarea", "title"]);

/**
 * Strip an HTML (or .dc.html) document: `<!-- -->` comments in markup, JS comments in
 * script blocks of a JS type (checked by acorn), CSS comments in style blocks. Start and
 * end tags are copied whole, so attribute values are never touched (`<p title="<!-- t -->">`
 * stays). Textarea and title content, and non-JS scripts (JSON-LD), are left exactly as they are.
 */
export function stripHtml(src, where = "html") {
  let out = "";
  let i = 0;
  const n = src.length;
  const lower = src.toLowerCase();
  while (i < n) {
    if (src.startsWith("<!--", i)) {
      const end = src.indexOf("-->", i + 4);
      i = end === -1 ? n : end + 3;
      continue;
    }
    if (src[i] === "<" && /[A-Za-z/!?]/.test(src[i + 1] ?? "")) {
      const open = tagEnd(src, i);
      const tag = src.slice(i, open);
      out += tag;
      i = open;
      const m = /^<([A-Za-z][A-Za-z0-9-]*)/.exec(tag);
      const name = m ? m[1].toLowerCase() : "";
      if (!RAW_TEXT.has(name) || tag.endsWith("/>")) continue;
      const close = lower.indexOf(`</${name}`, open);
      const stop = close === -1 ? n : close;
      const body = src.slice(open, stop);
      let next = body;
      if (name === "style") next = stripCss(body);
      else if (name === "script") {
        const type = (/\stype\s*=\s*["']?([^"'\s>]+)/i.exec(tag)?.[1] ?? "").toLowerCase();
        if (JS_TYPES.has(type)) next = stripJsChecked(body, `${where} <script>`);
      }
      out += next;
      i = stop;
      continue;
    }
    out += src[i];
    i += 1;
  }
  return out;
}

/**
 * Strip every served text file under dir in place: .html (stripHtml), .js (stripJsChecked),
 * .css (stripCss). Folders named in `skipDirs` are left alone: `ops/` (the public host answers
 * 404 there; the dashboard serves it behind sign-in and its tests pin it byte-equal to the
 * source). Licence notices stay. Returns the paths that changed.
 */
export function stripTree(dir, skipDirs = new Set(["ops"])) {
  const changed = [];
  const walk = (d, rel) => {
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, ent.name);
      const r = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) { if (!(rel === "" && skipDirs.has(ent.name))) walk(p, r); continue; }
      let fn = null;
      if (ent.name.endsWith(".html")) fn = (x) => stripHtml(x, r);
      else if (ent.name.endsWith(".js")) fn = (x) => stripJsChecked(x, r);
      else if (ent.name.endsWith(".css")) fn = stripCss;
      if (!fn) continue;
      const src = readFileSync(p, "utf8");
      const next = fn(src);
      if (next !== src) { writeFileSync(p, next); changed.push(r); }
    }
  };
  walk(dir, "");
  return changed;
}
