// Nothing a visitor can fetch names our Supabase project or carries a developer note
// (owner, 2026-10-04: "hide all ids").
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as acornParse } from "acorn";
import { describe, expect, it } from "vitest";
import { stripCss, stripHtml, stripJsChecked } from "../../../../scripts/strip-public-comments.mjs";
import { openSealedPhotoPath, SEALED_PHOTO_PREFIX, sealClassPhotoKey, sealClassPhotoUrls } from "../photos/sealed-url";
import { publicCatalogRoutes } from "../pricing/public-board";
import type { QuotePipelineOk } from "../quote/pipeline";
import { publicQuoteBody, sealedQuoteResponse } from "../quote/respond";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");
const repoRoot = join(webRoot, "../..");
// Built from parts so this file does not itself carry the ref.
const PROJECT_REF = ["yaumjzvyl", "ngfjhtuffqs"].join("");
// An internal note in a served text file: an ADR or decision id, a planning path, the project ref.
const INTERNAL_NOTE = new RegExp(`\\bADR-\\d|\\bD-\\d{2,}\\b|\\.planning\\b|${PROJECT_REF}`);

const JS_SCRIPT_TYPES = new Set(["", "text/javascript", "application/javascript", "module", "text/x-dc", "text/babel"]);

/** The bodies of the JS `<script>` blocks of a page (the same types the strip reads). */
function jsScriptBlocks(html: string): string[] {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((m) => JS_SCRIPT_TYPES.has((/\stype\s*=\s*["']?([^"'\s>]+)/i.exec(m[1] ?? "")?.[1] ?? "").toLowerCase()))
    .map((m) => m[2] ?? "");
}

function files(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) files(p, out);
    else if (/\.(html|js|json|css|md|txt)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** A developer block comment in JS/CSS (licence notices `/*!` aside), strings blanked first. */
function hasBlockComment(text: string): boolean {
  return /(^|[\s;{}(,])\/\*(?!!)/.test(text.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""'));
}

describe("no internal ids on public surfaces", () => {
  it("the DC mock sources never name the Supabase project", () => {
    const hits = files(join(repoRoot, "app")).filter((f) => readFileSync(f, "utf8").includes(PROJECT_REF));
    expect(hits).toEqual([]);
  });

  it("the React cookies twin shows the auth cookie without the project ref", () => {
    const twin = readFileSync(join(webRoot, "app/[locale]/cookies/page.tsx"), "utf8");
    expect(twin).not.toContain(PROJECT_REF);
    expect(twin).toContain('tech="vt-auth"');
    expect(twin).not.toContain("auth-token");
  });

  // `pnpm test` syncs first. Without a synced copy the case shows as skipped locally and fails in CI.
  const pub = join(webRoot, "public");
  const synced = existsSync(join(pub, "app"));
  it.skipIf(!synced && !process.env.CI)("the served copy (after sync) has no project ref, no HTML comments, no design-system tooling", () => {
    expect(synced, "run node scripts/sync-dc-mock-to-public.mjs first").toBe(true);
    const served = [...files(join(pub, "app")), ...files(join(pub, "_ds"))];
    expect(served.filter((f) => readFileSync(f, "utf8").includes(PROJECT_REF))).toEqual([]);
    // Dashboard screens (app/ops) included: the dashboard host serves them without a sign-in.
    const pages = served.filter((f) => f.endsWith(".html"));
    expect(pages.filter((f) => readFileSync(f, "utf8").includes("<!--"))).toEqual([]);
    expect(served.filter((f) => /(readme\.md|_ds_manifest\.json|_adherence\.oxlintrc\.json)$/.test(f))).toEqual([]);
    // Served scripts, styles and the bundle carry no developer comment (licence notices aside).
    const code = served.filter((f) => /\.(js|css)$/.test(f));
    const commented = code.filter((f) => hasBlockComment(readFileSync(f, "utf8")));
    expect(commented).toEqual([]);
  });

  // Review of fix/hide-internal-ids: /app/ops/* is answered on the dashboard host with no staff
  // check, so its notes (OpsDetail ~120 comment lines, support.js ~50) were readable by anyone.
  // Every served file must be its own strip (no `//`, `/* */` or `<!-- -->` left), and every
  // script in it must parse, or the acorn proof never ran on it and a comment could hide there.
  it.skipIf(!synced && !process.env.CI)("the served dashboard screens (public/app/ops) are stripped like every other served file", () => {
    expect(synced, "run node scripts/sync-dc-mock-to-public.mjs first").toBe(true);
    const ops = files(join(pub, "app", "ops")).filter((f) => /\.(html|js|css)$/.test(f));
    expect(ops.length).toBeGreaterThan(20);
    const served = [...files(join(pub, "app")), ...files(join(pub, "_ds"))].filter((f) => /\.(html|js|css)$/.test(f));
    const unstripped = served.filter((f) => {
      const t = readFileSync(f, "utf8");
      const again = f.endsWith(".css") ? stripCss(t) : f.endsWith(".js") ? stripJsChecked(t, f) : stripHtml(t, f);
      return again !== t;
    });
    expect(unstripped).toEqual([]);
    const unreadable: string[] = [];
    for (const f of ops) {
      if (f.endsWith(".css")) continue;
      const t = readFileSync(f, "utf8");
      const scripts = f.endsWith(".js") ? [t] : jsScriptBlocks(t);
      for (const s of scripts) {
        try {
          acornParse(s, { ecmaVersion: "latest", sourceType: "script", allowReturnOutsideFunction: true, allowHashBang: true });
        } catch (e) {
          unreadable.push(`${f}: ${(e as Error).message}`);
        }
      }
    }
    expect(unreadable).toEqual([]);
  }, 120_000); // acorn parses every served dashboard file: well over the 5 s default on a CI runner (2026-10-19)

  // A served licence or readme is copied as it is (no strip): an internal note there must fail here.
  // public/brand is committed, so this runs without a sync; app, _ds and assets are added once synced.
  it("no served .txt or .md file carries an internal note (ADR or decision ids, .planning, project ref)", () => {
    const notes = files(pub).filter((f) => /\.(txt|md)$/i.test(f));
    expect(notes.some((f) => f.endsWith(join("brand", "fonts", "OFL-NotoSansArabic.txt")))).toBe(true);
    const flagged = notes.filter((f) => INTERNAL_NOTE.test(readFileSync(f, "utf8")));
    expect(flagged).toEqual([]);
  });

  // public/brand is committed and served as it is (no sync strip), so its token CSS was stripped
  // by hand (8cf45166). Review of 2dcf9d88: a comment put back there must fail here.
  it("public/brand (served as committed) has no developer comment and no project ref", () => {
    const brandDir = join(pub, "brand");
    const brand = files(brandDir);
    const css = brand.filter((f) => f.endsWith(".css"));
    expect(css.length).toBeGreaterThan(0);
    expect(css.filter((f) => hasBlockComment(readFileSync(f, "utf8")))).toEqual([]);
    expect(brand.filter((f) => readFileSync(f, "utf8").includes(PROJECT_REF))).toEqual([]);
    const svg: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".svg")) svg.push(p);
      }
    };
    walk(brandDir);
    expect(svg.filter((f) => readFileSync(f, "utf8").includes("<!--"))).toEqual([]);
  });
});

describe("/cookies rows", () => {
  const cookies = readFileSync(join(repoRoot, "app/pages/cookies.dc.html"), "utf8");

  it("the auth cookie reads vt-auth", () => {
    expect(cookies).toContain('<span data-ck-tech="1" class="vt-dir-keep" data-vt-no-i18n="1">vt-auth</span>');
    expect(cookies).not.toContain("auth-token");
  });

  it("every cookie row leads with its plain name; the technical name sits underneath, left to right, untranslated", () => {
    const names: [string, string][] = [
      ["Sign-in", "vt-auth"],
      ["Your cookie choice", "consent_subject · vamosCookieConsent"],
      ["Stripe payment", "__stripe_mid · __stripe_sid"],
      ["Cloudflare check", "cf_clearance"],
      ["Fair pricing", "vamos_qs"],
      ["Booking access", "vt_manage"],
      ["Language", "NEXT_LOCALE"],
      ["Language (this browser)", "vamosLang"],
      ["Recent addresses", "vamos:recent-places"],
    ];
    const dict = readFileSync(join(repoRoot, "app/vamos-i18n-dict.js"), "utf8");
    for (const [plain, tech] of names) {
      expect(cookies).toContain(
        `<td data-l="Name"><span data-ck-name="1"><span data-ck-plain="1">${plain}</span><span data-ck-tech="1" class="vt-dir-keep" data-vt-no-i18n="1">${tech}</span></span></td>`,
      );
      expect(dict, plain).toContain(`'${plain}': { de: '`);
    }
  });
});

describe("legal pages say nothing about test mode or unused vendors (COPY-DRAFT 2026-10-04)", () => {
  const pages = ["app/pages/cookies.dc.html", "app/pages/privacy.dc.html", "app/pages/CookieBanner.dc.html", "app/home/CookieBanner.dc.html"];
  const banned = ["not in use until live payments", "Sentry", "as set by Cloudflare", "as issued by Supabase Auth", "The platform we are building", "transactional mail is on", ">none<", ">not used<"];

  it.each(pages)("%s carries none of the internal phrases", (rel) => {
    const html = readFileSync(join(repoRoot, rel), "utf8");
    for (const b of banned) expect(html, b).not.toContain(b);
  });

  it("every new visible string has de, fr and ar", () => {
    const dict = readFileSync(join(repoRoot, "app/vamos-i18n-dict.js"), "utf8");
    for (const k of [
      "Up to 400 days, or until you sign out", "Up to 400 days", "1 year · 30 minutes", "30 minutes",
      "No cookie", "Nothing is stored in your browser", "Tells us which step of a booking people abandon.",
      "Our suppliers", "Confirmation and driver-detail emails",
    ]) expect(dict, k).toMatch(new RegExp(`'${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}': \\{ de: '[^']+', fr: '[^']+', ar: '[^']+' \\}`));
  });
});

describe("no internal phrases in strings the browser receives (reviewer F2, 2026-10-04)", () => {
  const files = [
    "apps/web/i18n/messages/en.json",
    "apps/web/i18n/messages/de.json",
    "apps/web/i18n/messages/fr.json",
    "apps/web/i18n/messages/ar.json",
    "app/vamos-i18n-dict.js",
  ];
  it.each(files)("%s names no Sentry, Supabase Auth, test mode or mail switch", (rel) => {
    const s = readFileSync(join(repoRoot, rel), "utf8");
    for (const b of ["Sentry", "Supabase Auth", "not in use until", "transactional mail is on"]) expect(s, b).not.toContain(b);
  });

  it("the React cookie banner uses the approved wording (COPY-DRAFT §3)", () => {
    const en = JSON.parse(readFileSync(join(repoRoot, "apps/web/i18n/messages/en.json"), "utf8")) as {
      cookies: Record<string, string>;
    };
    expect(en.cookies["sheet-necessary-duration"]).toBe("Up to 400 days");
    expect(en.cookies["sheet-analytics-providers"]).toBe("Cloudflare Web Analytics (cookieless)");
    expect(en.cookies["sheet-not-used"]).toBe("No cookie");
    expect(en.cookies["tells-us-which-step-of-a-booking-people-abandon"]).toBe("Tells us which step of a booking people abandon.");
  });
});

// Security S10 (2026-10-05): the public quote answer, the class photos and the review list carry no
// internal row id. Every case below fails on the code before the fix.
describe("S10: no internal ids in public API answers", () => {
  const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const CLASS_ID = "5b1f3c2a-9d4e-4f6a-8b7c-1d2e3f4a5b6c";
  const ZONE_A = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
  const ZONE_B = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
  const QUOTE_ID = "11111111-1111-4111-8111-111111111111";
  const SECRET = "test-quote-lock-secret-0123456789abcdef";
  const PHOTO_KEY = `classes/${CLASS_ID}/0975620a-98e5-4657-9986-24fd637bfc0a.png`;

  function quote(): QuotePipelineOk {
    return {
      ok: true,
      quote_id: QUOTE_ID,
      lock: "v1.payload.mac",
      expires_at: "2099-01-01T12:00:00.000Z",
      engine_version: "quote-engine@abcdef1",
      pricing_live: true,
      vat_rate_bps: 81,
      rate_version: { id: 18, slug: "book-18" },
      settings_version_id: 7,
      display_currency: "CHF",
      route: {
        legs: [
          {
            leg_seq: 1,
            distance_m: 12000,
            duration_s: 1200,
            geometry: { type: "LineString", coordinates: [[8.54, 47.37], [8.56, 47.45]] },
            origin_zone_id: ZONE_A,
            dest_zone_id: ZONE_B,
          },
        ],
      },
      no_eligible_class: false,
      classes: [
        {
          slug: "saden",
          eligible: true,
          ineligible_reason: null,
          effective_max_pax: 3,
          max_bags: 3,
          fixed_route: false,
          total_rappen: 1000,
          name: "Economy",
          photo_url: `/photos/${PHOTO_KEY}`,
          lines: [
            {
              seq: 1,
              leg_seq: 1,
              kind: "distance_start",
              code: "distance_start",
              i18n_key: "quote.line.distance_start",
              basis: "per_trip",
              source_row: { table: "distance_rates", id: 42, rate_version_id: 18 },
              amount_rappen: 1000,
            } as never,
          ],
        },
      ],
      policy: {
        settings_version_id: 7,
        free_cancel_hours: 24,
        modification_deadline_hours: null,
        min_advance_minutes: null,
        airport_waiting_minutes: null,
        city_waiting_minutes: null,
        cancellation_tiers: [],
        policy_doc: null,
      },
    };
  }

  it("the quote answer has no price book row, settings row, line source row or zone row", () => {
    const body = publicQuoteBody(quote()) as unknown as Record<string, unknown>;
    const text = JSON.stringify(body);
    expect(body).not.toHaveProperty("rate_version");
    expect(body).not.toHaveProperty("settings_version_id");
    expect(body.policy).not.toHaveProperty("settings_version_id");
    expect(text).not.toContain("source_row");
    expect(text).not.toContain("distance_rates");
    expect(text).not.toContain("zone_id");
    expect(text).not.toContain(ZONE_A);
    // What the pages read is still there.
    expect(body.quote_id).toBe(QUOTE_ID);
    expect((body.policy as Record<string, unknown>).free_cancel_hours).toBe(24);
    expect((body.route as { legs: Array<Record<string, unknown>> }).legs[0]?.distance_m).toBe(12000);
  });

  it("the quote answer's class photo is sealed: no class id, and it opens back to the stored key", async () => {
    const res = await sealedQuoteResponse(quote(), SECRET);
    const body = (await res.json()) as { quote_id: string; classes: Array<{ photo_url: string | null }> };
    const url = body.classes[0]?.photo_url ?? "";
    expect(url.startsWith(SEALED_PHOTO_PREFIX)).toBe(true);
    expect(url).toMatch(/\.png$/);
    expect(JSON.stringify({ ...body, quote_id: "" })).not.toMatch(UUID_RE);
    expect(await openSealedPhotoPath([SECRET], url)).toBe(PHOTO_KEY);
    // The same photo always gets the same address (browsers keep caching it).
    expect(await sealClassPhotoKey(SECRET, PHOTO_KEY)).toBe(url);
  });

  it("a sealed address opens only with the Worker secret, only to a classes/ key, and not when altered", async () => {
    const url = (await sealClassPhotoKey(SECRET, `classes/${CLASS_ID}/brand.jpg`))!;
    expect(await openSealedPhotoPath(["another-secret"], url)).toBeNull();
    expect(await openSealedPhotoPath([undefined, SECRET], url)).toBe(`classes/${CLASS_ID}/brand.jpg`);
    expect(await openSealedPhotoPath([SECRET], url.replace(/\.jpg$/, ".png"))).toBeNull();
    const token = url.slice(SEALED_PHOTO_PREFIX.length, -".jpg".length);
    const flipped = token.slice(0, -2) + (token.endsWith("A") ? "BB" : "AA");
    expect(await openSealedPhotoPath([SECRET], `${SEALED_PHOTO_PREFIX}${flipped}.jpg`)).toBeNull();
    expect(await sealClassPhotoKey(SECRET, "vehicles/x/y.jpg")).toBeNull();
    expect(await sealClassPhotoKey(undefined, `classes/${CLASS_ID}/brand.jpg`)).toBeNull();
  });

  it("without the secret a class photo is left out rather than sent with its id", async () => {
    const out = await sealClassPhotoUrls(undefined, quote().classes);
    expect(out[0]?.photo_url).toBeNull();
    const other = await sealClassPhotoUrls(undefined, [{ photo_url: "/photos/site/hero.jpg" }]);
    expect(other[0]?.photo_url).toBe("/photos/site/hero.jpg");
  });

  it("the routes that send class photos send them sealed, and the photo route opens them", () => {
    const quoteRoute = readFileSync(join(webRoot, "app/api/quote/route.ts"), "utf8");
    const reprice = readFileSync(join(webRoot, "app/api/quote/reprice/route.ts"), "utf8");
    const photos = readFileSync(join(webRoot, "app/photos/[key]/route.ts"), "utf8");
    expect(quoteRoute).toMatch(/classes: await sealClassPhotoUrls\(/);
    expect(quoteRoute).toMatch(/await sealedQuoteResponse\(result,/);
    expect(quoteRoute).not.toMatch(/\bquoteResponse\(result\)/);
    expect(reprice).toMatch(/await sealedQuoteResponse\(result,/);
    expect(reprice).not.toMatch(/\bquoteResponse\(result\)/);
    expect(photos).toMatch(/openSealedPhotoPath\(/);
  });

  it("the fixed-route list is keyed by zone slugs, never zone row ids", () => {
    const zone = (id: string, slug: string) => ({ id, slug, kind: "city", iata: null, tags: [] }) as never;
    const routes = publicCatalogRoutes({
      zones: [zone(ZONE_A, "zurich-airport"), zone(ZONE_B, "zermatt")],
      fixed_routes: [{ origin_zone_id: ZONE_A, dest_zone_id: ZONE_B, vehicle_class_id: CLASS_ID, live: true }],
    } as never);
    expect(routes).toHaveLength(1);
    expect(JSON.stringify(routes)).not.toMatch(UUID_RE);
    expect(routes[0]?.key).toBe("zurich-airport::zermatt");
    // A pair whose zone row is missing could only be named by its id: it stays out.
    const orphan = publicCatalogRoutes({
      zones: [zone(ZONE_A, "zurich-airport")],
      fixed_routes: [{ origin_zone_id: ZONE_A, dest_zone_id: ZONE_B, vehicle_class_id: CLASS_ID, live: true }],
    } as never);
    expect(orphan).toEqual([]);
  });

  it("the public review list selects and sends no review row id", () => {
    const loader = readFileSync(join(webRoot, "lib/public/reviews.ts"), "utf8");
    expect(loader).not.toMatch(/^\s*r\.id,/m);
    expect(loader).not.toMatch(/^\s*id: row\.id,/m);
    expect(loader).not.toMatch(/^\s*id: string;/m);
  });
});

