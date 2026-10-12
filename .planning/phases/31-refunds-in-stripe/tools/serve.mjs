// Offline static server for the synced DC tree (apps/web/public after scripts/sync-dc-mock-to-public.mjs).
// Dashboard paths serve the one ops shell as serveOpsDc does (base href + vamosOpsAuth). /photos/* answers
// with a local brand photograph. Listens on a port chosen by the OS; the caller closes it. /api/* is never
// answered here (Playwright stubs it) and anything unknown is a 404: nothing leaves this machine.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".webp": "image/webp", ".ttf": "font/ttf", ".otf": "font/otf", ".woff": "font/woff", ".woff2": "font/woff2",
};
const OPS = /^\/(dashboard|bookings(\/[^/]+)?|calendar|customers(\/[^/]+)?|fleet(\/chauffeurs(\/[^/]+)?)?|chauffeurs|support|pricing|profile|settings|coupons|reviews|pages|legal)$/;
const repo = resolve(new URL("../../../../", import.meta.url).pathname);
const PHOTO = join(repo, "assets/photography/class-business.jpg");

export function serve(root = join(repo, "apps/web/public")) {
  return new Promise((res0) => {
    const server = createServer((req, res) => {
      let p = decodeURIComponent((req.url || "/").split("?")[0]);
      if (p.startsWith("/photos/")) {
        res.writeHead(200, { "content-type": "image/jpeg", "cache-control": "no-store" });
        res.end(readFileSync(PHOTO));
        return;
      }
      let inject = false;
      if (OPS.test(p)) { p = "/app/ops/ops.html"; inject = true; }
      const file = normalize(join(root, p));
      if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      let body = readFileSync(file);
      if (inject) {
        const html = body.toString("utf8");
        const boot = (html.includes('href="/app/ops/"') ? "" : '<base href="/app/ops/">') +
          '<script>try{localStorage.setItem("vamosOpsAuth","1")}catch(e){}</script>';
        body = Buffer.from(html.replace(/<head([^>]*)>/i, `<head$1>${boot}`));
      }
      res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
      res.end(body);
    });
    server.listen(0, "127.0.0.1", () => res0({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}
