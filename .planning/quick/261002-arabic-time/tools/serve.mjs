// Static server for a synced DC public tree (apps/web/public after
// scripts/sync-dc-mock-to-public.mjs). Pretty URLs like the Worker:
// /<page> and /<lang>/<page> -> /app/pages/<page>.html, / -> /app/home/home.html.
// /api/* answers are stubbed by the Playwright script, never here.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};
const PAGES = new Set([
  "about", "faq", "contact", "terms", "privacy", "cookies", "cancellation", "imprint",
  "sign-in", "reset-password", "manage-booking", "booking-detail", "account", "bookings",
  "coming-soon", "sitemap",
]);

// Dashboard host mode: the console paths serve the one ops shell, as serveOpsDc does.
const OPS = /^\/(dashboard|bookings(\/[^/]+)?|calendar|customers(\/[^/]+)?|fleet(\/chauffeurs(\/[^/]+)?)?|support|pricing|profile|settings|coupons|reviews|pages|legal)$/;

export function serve(root, { ops = false } = {}) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let p = decodeURIComponent((req.url || "/").split("?")[0]);
      const loc = p.match(/^\/(en|de|fr|ar)(?=\/|$)/);
      if (loc) p = p.slice(loc[0].length) || "/";
      if (ops && OPS.test(p)) p = "/app/ops/ops.html";
      else if (p === "/") p = "/app/home/home.html";
      else if (p === "/sign-up") p = "/app/pages/sign-in.html";
      else if (PAGES.has(p.slice(1))) p = `/app/pages/${p.slice(1)}.html`;
      else if (/^\/account\/[a-z]+$/.test(p)) p = "/app/pages/account.html";
      const file = normalize(join(root, p));
      if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, {
        "content-type": MIME[extname(file)] || "application/octet-stream",
        "cache-control": "no-store",
      });
      res.end(readFileSync(file));
    });
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, base: `http://127.0.0.1:${server.address().port}` }),
    );
  });
}
