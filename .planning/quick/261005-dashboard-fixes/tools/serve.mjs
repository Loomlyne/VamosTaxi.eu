// Static server for a synced DC public tree (apps/web/public after scripts/sync-dc-mock-to-public.mjs),
// dashboard host mode: the console paths serve the one ops shell, /login serves the sign-in page, as
// serveOpsDc does. Listens on a free port chosen by the OS; the caller closes it (no process is killed).
//
// `gate.failNext = n` models a slow Supabase Auth: the next n screen files answer the private 404 once, then the
// session answers again (U8 review: a live session whose screen file 404ed stayed blank).
// `gate.dead = true` models a session that has died: every /app/ops/*.dc.html except the two sign-in
// files answers the gate's private 404 (lib/ops/asset-gate.ts). /api/* is stubbed by the Playwright
// script, never here.
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
const OPS = /^\/(dashboard|bookings(\/[^/]+)?|calendar|customers(\/[^/]+)?|fleet(\/chauffeurs(\/[^/]+)?)?|support|pricing|profile|settings|coupons|reviews|pages|legal)$/;
const LOGIN_FILES = new Set(["/app/ops/support.js", "/app/ops/AuthForm.dc.html"]);

// `gate.failFiles` is a Set of /app/ops/<Name>.dc.html paths that always answer 404 (a nested part that did not
// load: PlaceSearch when OpsDetail enters edit mode), whatever the session.
// `gate.failOnceFiles` is a Set of the same kind of paths that answer 404 once and are then served (261005-dashboard-followups:
// the sidebar's slow-Auth miss at boot).
export const gate = { dead: false, failNext: 0, failFiles: new Set(), failOnceFiles: new Set(), hits: [] };

export function serve(root) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let p = decodeURIComponent((req.url || "/").split("?")[0]);
      gate.hits.push(p);
      if (OPS.test(p)) p = "/app/ops/ops.html";
      else if (p === "/login") p = "/app/ops/ops-login.html";
      const screenFile = p.startsWith("/app/ops/") && p.endsWith(".dc.html") && !LOGIN_FILES.has(p);
      if (gate.failOnceFiles.has(p)) {
        gate.failOnceFiles.delete(p);
        res.writeHead(404, { "cache-control": "private, no-store" });
        res.end();
        return;
      }
      if (gate.failFiles.has(p)) {
        res.writeHead(404, { "cache-control": "private, no-store" });
        res.end();
        return;
      }
      if (screenFile && !gate.dead && gate.failNext > 0) {
        gate.failNext -= 1;
        res.writeHead(404, { "cache-control": "private, no-store" });
        res.end();
        return;
      }
      if (gate.dead && screenFile) {
        res.writeHead(404, { "cache-control": "private, no-store" });
        res.end();
        return;
      }
      const file = normalize(join(root, p));
      if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
      res.end(readFileSync(file));
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}
