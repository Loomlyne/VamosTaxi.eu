#!/usr/bin/env node
// scripts/check-next-public-allowlist.mjs
//
// D-35 / PLAT-06: fails when a client-exposed (`NEXT_PUBLIC_*`) identifier is used
// anywhere in `apps/web` source but is not declared in `scripts/public-env-allowlist.json`'s
// `allowed` array, and when a credential name from that file's `forbidden_substrings`
// array is found in the built client bundle (`apps/web/.open-next/assets/**`) — a value
// can reach the browser through an inlined constant, not only through `process.env`.
//
// No package on the registry covers this (01-RESEARCH.md § Don't Hand-Roll) — this is
// the honest custom-script case.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const webRoot = join(repoRoot, "apps/web");
const allowlistPath = join(repoRoot, "scripts/public-env-allowlist.json");
const openNextAssets = join(webRoot, ".open-next/assets");

const EXCLUDED_DIRS = new Set(["node_modules", ".next", ".open-next", ".git", ".wrangler"]);
const BINARY_EXT = new Set([
  ".ttf", ".otf", ".woff", ".woff2",
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".avif",
  ".mp4", ".mov", ".pdf",
]);
const NEXT_PUBLIC_RE = /\bNEXT_PUBLIC_[A-Z0-9_]+\b/g;

/** Recursively collect readable (non-binary, non-excluded) file paths under `dir`. */
function walk(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    if (EXCLUDED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      walk(full, files);
    } else if (stats.isFile() && !BINARY_EXT.has(extname(entry).toLowerCase())) {
      files.push(full);
    }
  }
  return files;
}

function loadAllowlist() {
  const raw = JSON.parse(readFileSync(allowlistPath, "utf8"));
  if (!Array.isArray(raw.allowed) || !Array.isArray(raw.forbidden_substrings)) {
    console.error(
      `${relative(repoRoot, allowlistPath)} must declare an "allowed" array and a "forbidden_substrings" array.`
    );
    process.exit(1);
  }
  return raw;
}

function findNextPublicIdentifiers() {
  const found = new Set();
  for (const file of walk(webRoot)) {
    const content = readFileSync(file, "utf8");
    const matches = content.match(NEXT_PUBLIC_RE);
    if (matches) for (const m of matches) found.add(m);
  }
  return found;
}

/** Zero declared and zero found is a pass, not a crash — handled explicitly. */
function checkSourceAllowlist(allowlist) {
  const found = findNextPublicIdentifiers();
  const allowed = new Set(allowlist.allowed);
  const undeclared = [...found].filter((id) => !allowed.has(id)).sort();

  if (undeclared.length === 0) {
    console.log(
      found.size === 0
        ? "check-next-public-allowlist: no NEXT_PUBLIC_* identifiers found in apps/web — pass."
        : `check-next-public-allowlist: all ${found.size} NEXT_PUBLIC_* identifier(s) found are on the allowlist — pass.`
    );
    return true;
  }

  console.error("check-next-public-allowlist: undeclared client-exposed identifier(s) found:");
  for (const id of undeclared) console.error(`  - ${id}`);
  console.error(
    `\nAdd each to "allowed" in ${relative(repoRoot, allowlistPath)} only after a deliberate review — ` +
      "anything listed there is readable by every visitor."
  );
  return false;
}

/** Scans the built client bundle, not only the source — a value can reach the browser
 *  through an inlined constant. No-ops (not a failure) until a build exists. */
function checkBuiltBundle(allowlist) {
  if (!existsSync(openNextAssets)) {
    console.log(
      "check-next-public-allowlist: no build output at apps/web/.open-next/assets — skipping built-bundle scan."
    );
    return true;
  }

  const forbidden = allowlist.forbidden_substrings;
  let ok = true;
  for (const file of walk(openNextAssets)) {
    const content = readFileSync(file, "utf8");
    for (const name of forbidden) {
      if (content.includes(name)) {
        console.error(
          `check-next-public-allowlist: forbidden credential name "${name}" found in built client bundle: ${relative(repoRoot, file)}`
        );
        ok = false;
      }
    }
  }
  if (ok) {
    console.log(
      "check-next-public-allowlist: built client bundle scanned, no forbidden credential names found — pass."
    );
  }
  return ok;
}

const allowlist = loadAllowlist();
const sourceOk = checkSourceAllowlist(allowlist);
const bundleOk = checkBuiltBundle(allowlist);

process.exit(sourceOk && bundleOk ? 0 : 1);
