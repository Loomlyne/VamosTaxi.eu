import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { stripCss, stripHtml, stripJs, stripJsChecked, stripTree } from "./strip-public-comments.mjs";

test("JS: line and block comments go, code stays", () => {
  const src = "/* Phase 26 D-14, .planning/decisions/x.md */\nvar a = 1; // owner 2026-10-01\nvar b = 2;\n";
  const out = stripJs(src);
  assert.ok(!out.includes("Phase 26"));
  assert.ok(!out.includes("owner"));
  assert.ok(out.includes("var a = 1;"));
  assert.ok(out.includes("var b = 2;"));
});

test("JS: comment markers inside strings, templates and regexes are not comments", () => {
  const src = [
    "var u = 'https://wa.me/41796267082';",
    'var v = "/* not a comment */";',
    "var t = `a // b ${x /* gone */ + '//'} c /* d */`;",
    "var r = /^(mailto:|tel:|https:\\/\\/wa\\.me\\/)/i;",
    "var s = x.split(/\\/\\//);",
    "var q = a / b / c; // gone",
    "if (ok) return /[/*]/.test(y);",
  ].join("\n");
  const out = stripJs(src);
  assert.ok(out.includes("'https://wa.me/41796267082'"));
  assert.ok(out.includes('"/* not a comment */"'));
  assert.ok(out.includes("`a // b ${x   + '//'} c /* d */`"));
  assert.ok(out.includes("/^(mailto:|tel:|https:\\/\\/wa\\.me\\/)/i"));
  assert.ok(out.includes("/\\/\\//"));
  assert.ok(out.includes("var q = a / b / c;"));
  assert.ok(!out.includes("gone"));
  assert.ok(out.includes("return /[/*]/.test(y)"));
});

test("JS: a block comment keeps its newlines so automatic semicolons do not change", () => {
  assert.equal(stripJs("a = 1/*\nx\n*/b = 2"), "a = 1\n\nb = 2");
  assert.equal(stripJs("a/* x */b"), "a b");
});

test("JS: license notices stay", () => {
  const src = "/*! React v18 | MIT */\n/** @license MIT */\nvar a;";
  assert.equal(stripJs(src), src);
});

test("CSS: comments go, strings stay", () => {
  assert.equal(stripCss('a{b:c}/* no glow, owner */d{content:"/* keep */"}'), 'a{b:c} d{content:"/* keep */"}');
});

test("HTML: markup comments, script and style comments go; attributes, text and JSON-LD stay", () => {
  const src = [
    "<!-- 26.4.2 D-01 -->",
    '<div title="a -- b" data-x="{{ a > b }}">Text // not a comment</div>',
    "<style>/* note */a{b:c}</style>",
    '<script type="text/x-dc" data-props="{&quot;x&quot;: &quot;() =&gt; void&quot;}">// apps/web/lib/x.ts\nclass C {}</script>',
    '<script type="application/ld+json">{"u":"https://x/*y*/"}</script>',
    '<script src="../vamos-locale.js"></script>',
  ].join("\n");
  const out = stripHtml(src);
  assert.ok(!out.includes("26.4.2"));
  assert.ok(!out.includes("apps/web"));
  assert.ok(!out.includes("/* note */"));
  assert.ok(out.includes('<div title="a -- b" data-x="{{ a > b }}">Text // not a comment</div>'));
  assert.ok(out.includes("a{b:c}</style>"));
  assert.ok(out.includes("class C {}</script>"));
  assert.ok(out.includes('{"u":"https://x/*y*/"}'));
  assert.ok(out.includes('<script src="../vamos-locale.js"></script>'));
});

test("HTML: comment-like text inside attribute values, textarea and title is left alone (reviewer probe)", () => {
  const src = '<p title="<!-- t -->">x</p><textarea><!-- keep --> // a</textarea><title>a <!-- b --></title><!-- go -->';
  assert.equal(stripHtml(src), '<p title="<!-- t -->">x</p><textarea><!-- keep --> // a</textarea><title>a <!-- b --></title>');
});

test("stripJsChecked: proves the result with acorn and refuses to change code", () => {
  assert.equal(stripJsChecked("var a = 1; // note\n"), "var a = 1; \n");
  assert.equal(stripJsChecked("var a = 1;\n"), "var a = 1;\n");
  // Not readable JS (JSX): left exactly as it is.
  assert.equal(stripJsChecked("const x = <div>// y</div>;"), "const x = <div>// y</div>;");
});

test("stripTree: strips .js, .css and .html in place (support.js and the ops/ dashboard screens too, licences kept), leaves other files alone", () => {
  const root = mkdtempSync(join(tmpdir(), "strip-"));
  mkdirSync(join(root, "pages"));
  mkdirSync(join(root, "ops"));
  writeFileSync(join(root, "ops", "OpsBoard.dc.html"), "<!-- dashboard only --><p>b</p><script type=\"text/x-dc\">// OpsDetail note\nclass B {}</script>");
  writeFileSync(join(root, "ops", "support.js"), "/** @license MIT */\n// src/ops.ts\nvar o;");
  writeFileSync(join(root, "vamos-x.js"), "// internal\nvar a;");
  writeFileSync(join(root, "support.js"), "/** @license MIT */\n// src/boot.ts\nvar b;");
  writeFileSync(join(root, "t.css"), "/* note */a{b:c}");
  writeFileSync(join(root, "pages", "p.dc.html"), "<!-- internal --><p>x</p>");
  writeFileSync(join(root, "pages", "n.svg"), "<!-- svg -->");
  const changed = stripTree(root).sort();
  assert.deepEqual(changed, ["ops/OpsBoard.dc.html", "ops/support.js", "pages/p.dc.html", "support.js", "t.css", "vamos-x.js"]);
  assert.equal(readFileSync(join(root, "vamos-x.js"), "utf8"), "\nvar a;");
  assert.equal(readFileSync(join(root, "support.js"), "utf8"), "/** @license MIT */\n\nvar b;");
  assert.equal(readFileSync(join(root, "t.css"), "utf8"), " a{b:c}");
  assert.equal(readFileSync(join(root, "pages", "p.dc.html"), "utf8"), "<p>x</p>");
  assert.equal(readFileSync(join(root, "pages", "n.svg"), "utf8"), "<!-- svg -->");
  assert.equal(readFileSync(join(root, "ops", "OpsBoard.dc.html"), "utf8"), '<p>b</p><script type="text/x-dc">\nclass B {}</script>');
  assert.equal(readFileSync(join(root, "ops", "support.js"), "utf8"), "/** @license MIT */\n\nvar o;");
  assert.deepEqual(stripTree(root), []);
});
