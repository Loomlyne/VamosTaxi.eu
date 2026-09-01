#!/usr/bin/env node
/**
 * Copy the Claude Design export (app/ + design-system + assets + hero)
 * into apps/web/public so staging serves the mock as-is.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
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
  "app/pages/become-a-partner.dc.html",
  "app/pages/booking-detail.dc.html",
  "app/pages/bookings.dc.html",
  "app/pages/cancellation.dc.html",
  "app/pages/checkout.dc.html",
  "app/pages/coming-soon.dc.html",
  "app/pages/confirmation.dc.html",
  "app/pages/contact.dc.html",
  "app/pages/cookies.dc.html",
  "app/pages/faq.dc.html",
  "app/pages/imprint.dc.html",
  "app/pages/manage-booking.dc.html",
  "app/pages/privacy.dc.html",
  "app/pages/reset-password.dc.html",
  "app/pages/sign-in.dc.html",
  "app/pages/terms.dc.html",
  "app/ops/ops.dc.html",
  "app/ops/ops-login.dc.html",
];

function copy(from, to) {
  if (!existsSync(from)) {
    throw new Error(`missing ${from}`);
  }
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, {
    recursive: true,
    filter: (src) => {
      const parts = src.split(/[/\\]/);
      return !parts.includes("standalone") && !parts.includes(".DS_Store");
    },
  });
}

copy(resolve(repo, "app"), resolve(pub, "app"));
copy(resolve(repo, "design-system"), resolve(pub, "_ds", uuid));
copy(resolve(repo, "assets"), resolve(pub, "assets"));

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

console.log(
  `synced DC mock → apps/web/public (${PAGE_FILES.length} pages, ${readdirSync(resolve(pub, "app")).length} app entries)`,
);
