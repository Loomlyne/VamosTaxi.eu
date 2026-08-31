import assert from "node:assert/strict";
import { test } from "node:test";
import { assertHeadBase, injectBaseInto } from "./dc-page-base.mjs";

const POISON = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
</head>
<body>
<script type="text/x-dc">
  /* Stay on /account. Hash hrefs plus <base href="/app/pages/"> would otherwise
     leave this page. */
</script>
</body>
</html>
`;

test("a <base substring in a script comment does not skip head inject", () => {
  assert.equal(POISON.includes("<base "), true); // the 2026-09-01 ship bug
  const out = injectBaseInto(POISON, "/app/pages/");
  assertHeadBase(out, "/app/pages/", "account.dc.html");
  const head = out.slice(
    out.toLowerCase().indexOf("<head>"),
    out.toLowerCase().indexOf("</head>"),
  );
  assert.equal(head.includes('<base href="/app/pages/">'), true);
  assert.equal((head.match(/<base /g) || []).length, 1);
});

test("HTML comment in head is not a real base tag", () => {
  const src = `<html><head>\n<!-- <base href="/app/pages/"> -->\n</head><body></body></html>`;
  const out = injectBaseInto(src, "/app/pages/");
  assertHeadBase(out, "/app/pages/", "comment-in-head");
});

test("correct head base is left alone", () => {
  const src = `<html><head>\n<base href="/app/pages/">\n</head><body></body></html>`;
  const out = injectBaseInto(src, "/app/pages/");
  assert.equal(out, src);
});

test("wrong head base throws", () => {
  const src = `<html><head>\n<base href="/app/home/">\n</head><body></body></html>`;
  assert.throws(() => injectBaseInto(src, "/app/pages/"), /expected/);
});

test("missing head throws instead of shipping", () => {
  assert.throws(() => injectBaseInto("<html><body></body></html>", "/app/pages/"), /missing <head>/);
});
