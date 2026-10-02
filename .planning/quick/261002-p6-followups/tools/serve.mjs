// Static server for a synced DC public tree (apps/web/public after scripts/sync-dc-mock-to-public.mjs).
// Pretty URLs like the Worker: /<page> and /<lang>/<page> -> /app/pages/<page>.html, / -> /app/home/home.html.
// /api/* answers are stubbed by the Playwright script, never here.
//
// Patches (the repo files stay unchanged): serve(root, { patches }) applies, on the fly, the string
// patches named in `patches` (a Set). Before = no patches. After = the proposed change.
//   phones  : both customer pages show the phone inside an inline left-to-right span (like cancellation.dc.html:303)
//   toast   : (both pages) the toast box is centred with inset-inline:16px instead of start:50% + translateX(-50%)
//   time    : (both pages) manage-booking and booking-detail show the "change waiting for payment" sentence on 409 staff-change-waiting
//             (+ its four translations in the dictionary the runtime reads)
//   reach   : (both sides, inert without ?timing=late) lets the pictures open the "pickup is close" phone card, which
//             a customer cannot reach today: only the design tool's bookingTiming prop turns it on
//   laws    : design-system laws.css without `.vt-dp__nav *,` in the arrow-mirror rule
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

const PHONE = "+41 79 626 70 82";
export const NEW_SENTENCE = {
  en: "A change to this trip is waiting for payment. Pay the difference from our e-mail first, then ask for a new time.",
  de: "Eine Änderung dieser Fahrt wartet auf die Zahlung. Bezahlen Sie zuerst die Differenz über unsere E-Mail und fragen Sie dann nach einer neuen Zeit.",
  fr: "Une modification de ce trajet attend le paiement. Payez d’abord la différence depuis notre e-mail, puis demandez une nouvelle heure.",
  ar: "يوجد تعديل على هذه الرحلة بانتظار الدفع. ادفع الفرق أولاً من رسالتنا الإلكترونية، ثم اطلب وقتاً جديداً.",
};

function replaceOnce(src, from, to, label) {
  const n = src.split(from).length - 1;
  if (n !== 1) throw new Error(`patch ${label}: expected 1 match, found ${n}`);
  return src.replace(from, () => to);
}
function replaceAll(src, from, to, label, count) {
  const n = src.split(from).length - 1;
  if (n !== count) throw new Error(`patch ${label}: expected ${count} matches, found ${n}`);
  return src.split(from).join(to);
}

/** Patch A: the three customer phone displays. */
function patchPhones(src, name) {
  let out = replaceAll(
    src,
    `hint-size="200px,44px">${PHONE}</x-import>`,
    `hint-size="200px,44px"><span class="vt-dir-keep">${PHONE}</span></x-import>`,
    `phones/button ${name}`,
    2,
  );
  out = replaceOnce(
    out,
    `<span data-fork-cta="accent">${PHONE}</span>`,
    `<span data-fork-cta="accent"><span class="vt-dir-keep">${PHONE}</span></span>`,
    `phones/fork ${name}`,
  );
  return out;
}

/** Patch C (both pages): the toast box spans the screen less 16 px each side and stays centred (no physical translateX, which
 *  pushed it off centre and off screen in Arabic); only the toast itself takes clicks, so the page behind keeps working. */
function patchToast(src, name) {
  return replaceOnce(
    src,
    `<div data-noprint="1" aria-live="polite" style="position:fixed;inset-inline-start:50%;bottom:24px;transform:translateX(-50%);z-index:60;display:flex;flex-direction:column;align-items:center;gap:10px">
<x-import component-from-global-scope="VamosTaxiDesignSystem_245af1.Toast" tone="{{ toastTone }}" onClose="{{ hideToast }}" hint-size="300px,48px">{{ toast }}</x-import>
</div>`,
    `<div data-noprint="1" aria-live="polite" style="position:fixed;inset-inline:16px;bottom:24px;z-index:60;display:flex;flex-direction:column;align-items:center;gap:10px;pointer-events:none">
<div style="pointer-events:auto">
<x-import component-from-global-scope="VamosTaxiDesignSystem_245af1.Toast" tone="{{ toastTone }}" onClose="{{ hideToast }}" hint-size="300px,48px">{{ toast }}</x-import>
</div>
</div>`,
    `toast ${name}`,
  );
}

/** Patch B: the time-change refusal sentence (both pages; the handler text is the same). */
function patchTime(src) {
  return replaceOnce(
    src,
    `      }
      this.say(t('Could not request this time change.'), 'danger');
    }).catch(`,
    `      }
      if (result && result.body && result.body.code === 'staff-change-waiting') {
        this.say(t('${NEW_SENTENCE.en}'), 'danger');
        return;
      }
      this.say(t('Could not request this time change.'), 'danger');
    }).catch(`,
    "time/handler",
  );
}

/** Patch B, dictionary half: the four translations, in the file the runtime reads (strings[en] = {de, fr, ar}). */
function patchDict(src) {
  const entry = `      '${NEW_SENTENCE.en}': {
        de: '${NEW_SENTENCE.de}',
        fr: '${NEW_SENTENCE.fr}',
        ar: '${NEW_SENTENCE.ar}',
      },
`;
  return replaceOnce(src, `      'Flight number saved.':`, `${entry}      'Flight number saved.':`, "time/dict");
}

/** Picture-only reach aid, applied to before and after alike: ?timing=late makes timing() answer 'late'. */
function patchReach(src, name) {
  return replaceOnce(
    src,
    `timing() { return this.state.timing || this.props.bookingTiming || 'ahead'; }`,
    `timing() { return this.state.timing || (/[?&]timing=late/.test(String(location.search)) ? 'late' : (this.props.bookingTiming || 'ahead')); }`,
    `reach ${name}`,
  );
}

function patchLaws(src) {
  return replaceOnce(src, ".vt-dp__nav *,", "", "laws");
}

export function transform(urlPath, buf, patches) {
  if (!patches || patches.size === 0) return buf;
  const m = urlPath.match(/\/app\/pages\/(manage-booking|booking-detail)\.(?:dc\.)?html$/);
  if (m) {
    let s = buf.toString("utf8");
    if (patches.has("reach")) s = patchReach(s, m[1]);
    if (patches.has("phones")) s = patchPhones(s, m[1]);
    if (patches.has("time")) s = patchTime(s);
    if (patches.has("toast")) s = patchToast(s, m[1]);
    return Buffer.from(s, "utf8");
  }
  if (patches.has("time") && /\/app\/vamos-i18n-dict\.js$/.test(urlPath)) {
    return Buffer.from(patchDict(buf.toString("utf8")), "utf8");
  }
  if (patches.has("laws") && /\/tokens\/laws\.css$/.test(urlPath)) {
    return Buffer.from(patchLaws(buf.toString("utf8")), "utf8");
  }
  return buf;
}

export function serve(root, { patches = new Set() } = {}) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let p = decodeURIComponent((req.url || "/").split("?")[0]);
      const loc = p.match(/^\/(en|de|fr|ar)(?=\/|$)/);
      if (loc) p = p.slice(loc[0].length) || "/";
      if (p === "/") p = "/app/home/home.html";
      else if (PAGES.has(p.slice(1))) p = `/app/pages/${p.slice(1)}.html`;
      else if (/^\/account\/[a-z]+$/.test(p)) p = "/app/pages/account.html";
      const file = normalize(join(root, p));
      if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end();
        return;
      }
      let body;
      try {
        body = transform(p, readFileSync(file), patches);
      } catch (e) {
        res.writeHead(500);
        res.end(String(e));
        console.log("PATCH FAILED", String(e));
        return;
      }
      res.writeHead(200, {
        "content-type": MIME[extname(file)] || "application/octet-stream",
        "cache-control": "no-store",
      });
      res.end(body);
    });
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, base: `http://127.0.0.1:${server.address().port}` }),
    );
  });
}
