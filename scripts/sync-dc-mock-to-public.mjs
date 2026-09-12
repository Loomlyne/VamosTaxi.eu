#!/usr/bin/env node
/**
 * Copy the Claude Design export (app/ + design-system + assets + hero)
 * into apps/web/public so staging serves the mock as-is.
 *
 * One file per mock: Name.dc.html. Cloudflare html_handling is "none",
 * so do not write a second Name.dc — that object goes stale.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertHeadBase, injectBaseInto } from "./dc-page-base.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pub = resolve(repo, "apps/web/public");
const uuid =
  "vamos-taxi-design-system-245af154-0455-4c10-af76-5254642c3786";

const PAGE_FILES = [
  "app/home/home.dc.html",
  "app/pages/about.dc.html",
  "app/pages/account.dc.html",
  "app/pages/bookings.dc.html",
  "app/pages/cancellation.dc.html",
  "app/pages/coming-soon.dc.html",
  "app/pages/contact.dc.html",
  "app/pages/cookies.dc.html",
  "app/pages/faq.dc.html",
  "app/pages/imprint.dc.html",
  "app/pages/manage-booking.dc.html",
  "app/pages/booking-detail.dc.html",
  "app/pages/privacy.dc.html",
  "app/pages/reset-password.dc.html",
  "app/pages/sign-in.dc.html",
  "app/pages/sitemap.dc.html",
  "app/pages/terms.dc.html",
  "app/ops/ops.dc.html",
  "app/ops/ops-login.dc.html",
];

const SKIP_PUBLIC = new Set([
  "become-a-partner.dc.html",
  "checkout.dc.html",
  "confirmation.dc.html",
]);

/** Real Name.dc files are banned. html_handling none serves Name.dc.html only. */
function isDcCopy(name) {
  return name.endsWith(".dc") && !name.endsWith(".dc.html");
}

function copy(from, to) {
  if (!existsSync(from)) {
    throw new Error(`missing ${from}`);
  }
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, {
    recursive: true,
    filter: (src) => {
      const parts = src.split(/[/\\]/);
      const base = parts[parts.length - 1] ?? "";
      return (
        !parts.includes("standalone") &&
        !parts.includes(".DS_Store") &&
        !SKIP_PUBLIC.has(base) &&
        !isDcCopy(base)
      );
    },
  });
}

function stripDcCopies(dir) {
  if (!existsSync(dir)) return;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, ent.name);
    if (ent.isDirectory()) stripDcCopies(p);
    else if (isDcCopy(ent.name)) rmSync(p);
  }
}

copy(resolve(repo, "app"), resolve(pub, "app"));
copy(resolve(repo, "design-system"), resolve(pub, "_ds", uuid));
copy(resolve(repo, "assets"), resolve(pub, "assets"));

const pagesPub = resolve(pub, "app/pages");
for (const name of SKIP_PUBLIC) {
  for (const file of [name, name.replace(/\.dc\.html$/, ".html")]) {
    const leftover = resolve(pagesPub, file);
    if (existsSync(leftover)) rmSync(leftover);
  }
}

for (const name of [
  "hero-arrivals.jpg",
  "rectangle-msch23iq-dqll.png",
  "rectangle-msch2rwv-7g2c.png",
  "rectangle-msch3rzt-lwc6.png",
]) {
  const from = resolve(repo, name);
  if (existsSync(from)) {
    cpSync(from, resolve(pub, name));
  }
}

function injectBase(file, href) {
  const html = injectBaseInto(readFileSync(file, "utf8"), href);
  assertHeadBase(html, href, file);
  writeFileSync(file, html);
}

const redirectLines = [];
for (const rel of PAGE_FILES) {
  const dc = resolve(pub, rel);
  if (!existsSync(dc)) continue;
  const base = rel.startsWith("app/home/")
    ? "/app/home/"
    : rel.startsWith("app/ops/")
      ? "/app/ops/"
      : "/app/pages/";
  injectBase(dc, base);
  const htmlRel = rel.replace(/\.dc\.html$/, ".html");
  cpSync(dc, resolve(pub, htmlRel));
  redirectLines.push(`/${rel} /${htmlRel} 200`);
}

writeFileSync(join(pub, "_redirects"), redirectLines.join("\n") + "\n");

stripDcCopies(resolve(pub, "app"));

console.log(
  `synced DC mock → apps/web/public (${PAGE_FILES.length} pages, ${readdirSync(resolve(pub, "app")).length} app entries)`,
);
