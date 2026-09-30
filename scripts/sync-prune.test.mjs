import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pruneMissing } from "./sync-prune.mjs";

function tree(files) {
  const root = mkdtempSync(join(tmpdir(), "sync-prune-"));
  for (const f of files) {
    const p = join(root, f);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, "x");
  }
  return root;
}

test("removes files and folders that no longer exist in the source", () => {
  const src = tree(["keep.js", "icons/a.svg"]);
  const dest = tree(["keep.js", "icons/a.svg", "lenis.js", "icons/gone.svg", "old/deep/x.css"]);
  const removed = pruneMissing(src, dest);
  assert.deepEqual(removed.sort(), ["icons/gone.svg", "lenis.js", "old"].sort());
  assert.equal(existsSync(join(dest, "keep.js")), true);
  assert.equal(existsSync(join(dest, "icons/a.svg")), true);
  assert.equal(existsSync(join(dest, "lenis.js")), false);
  assert.equal(existsSync(join(dest, "old")), false);
  rmSync(src, { recursive: true });
  rmSync(dest, { recursive: true });
});

test("leaves an identical tree alone and returns nothing", () => {
  const src = tree(["a.js", "b/c.js"]);
  const dest = tree(["a.js", "b/c.js"]);
  assert.deepEqual(pruneMissing(src, dest), []);
  assert.deepEqual(readdirSync(dest).sort(), ["a.js", "b"]);
});

test("a missing destination is fine; a missing source is an error, never a wipe", () => {
  const src = tree(["a.js"]);
  assert.deepEqual(pruneMissing(src, join(tmpdir(), "sync-prune-does-not-exist")), []);
  const dest = tree(["a.js"]);
  assert.throws(() => pruneMissing(join(tmpdir(), "sync-prune-no-source"), dest), /missing source/);
  assert.equal(existsSync(join(dest, "a.js")), true);
});

test("a file in the source where the destination has a folder (or the reverse) is replaced, not kept", () => {
  const src = tree(["x/y.js"]);
  const dest = tree(["x"]);
  pruneMissing(src, dest);
  assert.equal(existsSync(join(dest, "x")), false);
});
