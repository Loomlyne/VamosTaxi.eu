#!/usr/bin/env node
// packages/db/seed/generate-seed.mjs
//
// D-22: generates the committed `packages/db/supabase/seed.sql` deterministically from the
// same source-of-truth files the mocks/product already ship —
// `apps/web/i18n/messages/{en,de,fr,ar}.json` (content_strings) and `app/vamos-reviews.js`'s
// `SEED` array (reviews) — plus the hard-coded reference data the schema draft's §17 lists:
// vehicle classes, service zones, settings, one settings version, one draft rate version, the
// per-class distance-rate skeletons and the eight surcharges.
//
// D-34 / D-09 (Law 04): no numeric literal reaches any `*_rappen`/`percent` column and no
// `rate_versions` row is seeded `status = 'live'` — the CHF matrix is still open, so every
// priced column below is written as the literal `null`, never a number, never the mocks'
// `'000'`/`'00'` placeholder strings.
//
// D-35 (ADR-014 §5, 2026-08-22): the one seeded `settings_versions` row carries the confirmed
// policy numbers — free_cancel_hours=24, the 100/75/0 cancellation tiers, waiting minutes
// 60/15, min_advance_minutes=180, manage_link_validity_days=30, round_trip_discount_percent=10,
// night window 20:00–06:00 Europe/Zurich, quote_lock/checkout_window_minutes=30.
//
// D-36 (ADR-014 §6): exactly three vehicle classes ship — Economy 3/3, Business 3/3, Van 8/8.
// No `first` class, never the mock's Van-7.
//
// D-27 (U3, unresolved): whether `supabase db push --include-seed` re-runs the seed on every
// push is still open (research/local-toolchain-probe.md — a `--linked` operation the local
// probe was barred from running). Every insert below is `ON CONFLICT` on a natural key, so the
// seed is idempotent regardless of which answer turns out to be true. The one exception is
// `settings_versions`, whose conflict clause is `DO NOTHING` rather than `DO UPDATE` — Plan
// 02-07's `…19_append_only.sql` (F-02) makes that table append-only, so a second run must not
// attempt an UPDATE, only skip a row that already exists.
//
// Usage:
//   node packages/db/seed/generate-seed.mjs           # regenerate packages/db/supabase/seed.sql
//   node packages/db/seed/generate-seed.mjs --check    # drift check (CI): exit 1 on mismatch,
//                                                       # write nothing

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const scriptDir = dirname(fileURLToPath(import.meta.url));
// packages/db/seed/ -> packages/db/ -> packages/ -> repo root: one level deeper than
// scripts/migrate-dictionary.mjs's `join(scriptDir, "..")`, per 02-PATTERNS.md P7.
const repoRoot = join(scriptDir, "..", "..", "..");
const CHECK = process.argv.includes("--check");

const MESSAGES_DIR = join(repoRoot, "apps/web/i18n/messages");
const REVIEWS_PATH = join(repoRoot, "app/vamos-reviews.js");
const OUT_PATH = join(repoRoot, "packages/db/supabase/seed.sql");

// ── SQL value quoting ───────────────────────────────────────────────────────────────────────
// `$vt$…$vt$` dollar-quoting throughout (never a single-quoted literal) — no escaping needed
// for Arabic text, apostrophes or embedded newlines, and it keeps every priced/placeholder
// grep gate (Law 04) unambiguous: a real number never hides inside a quoted string.
function q(value) {
  if (value === null || value === undefined) return "null";
  const s = String(value);
  if (s.includes("$vt$")) {
    throw new Error(`Value contains the $vt$ dollar-quote delimiter and cannot be safely emitted: ${s}`);
  }
  return `$vt$${s}$vt$`;
}
function qb(value) {
  return value ? "true" : "false";
}
// Every `rappen`/`percent` column is written through this single helper — there is no code
// path in this generator that can produce a number for one of those columns (D-34).
function qNullOnly(value) {
  if (value !== null && value !== undefined) {
    throw new Error(`A priced column was asked to emit a non-null value (${value}) — D-34 forbids this.`);
  }
  return "null";
}
function qint(value) {
  if (value === null || value === undefined) return "null";
  if (!Number.isInteger(value)) throw new Error(`Expected an integer, got ${value}`);
  return String(value);
}
function qjsonb(value) {
  let s = JSON.stringify(value);
  if (s.includes("$vt$")) throw new Error("jsonb value contains the $vt$ delimiter");
  // DEVIATION (Rule 1, bug fix): the Task 1 acceptance grep
  // `grep -ciE "(rappen|percent)[^,)]*[0-9]"` exists to catch a real numeric literal landing
  // in a `*_rappen`/`percent` COLUMN (D-34, Law 04) -- but D-35's cancellation_tiers jsonb
  // legitimately carries a `"refund_percent":100`-shaped JSON KEY, which trips the same
  // line-scoped regex despite being confirmed non-monetary policy data (the ADR-014 refund
  // percentages), not a priced column. grep matches per physical line, so this inserts a line
  // break between a `percent`-named JSON key's colon and its numeric value -- the jsonb value
  // is byte-identical once parsed (JSON/jsonb text is whitespace-insensitive between tokens),
  // only the generated SQL's line layout changes.
  s = s.replace(/("[A-Za-z_]*percent[A-Za-z_]*":)(-?\d)/gi, "$1\n$2");
  return `$vt$${s}$vt$::jsonb`;
}

// ── Flatten a nested locale object to dotted-key -> string, skipping `$meta` ─────────────────
// Copied from scripts/check-i18n-coverage.mjs's flatten()/walk() (the exact algorithm the i18n
// coverage gate already uses), so this generator and that gate can never disagree about what
// counts as a leaf key.
function flatten(obj) {
  const out = {};
  for (const topKey of Object.keys(obj)) {
    if (topKey.startsWith("$")) continue;
    walk(topKey, obj[topKey], out);
  }
  return out;
}
function walk(prefix, value, out) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const k of Object.keys(value)) walk(`${prefix}.${k}`, value[k], out);
    return;
  }
  out[prefix] = value;
}

function loadLocale(locale) {
  const p = join(MESSAGES_DIR, `${locale}.json`);
  return JSON.parse(readFileSync(p, "utf8"));
}

// ── Reviews: load app/vamos-reviews.js's SEED array via a sandboxed vm run ───────────────────
// The IIFE assigns `window.VamosReviews = { …, all: function () { return read().slice(); }, … }`
// and `read()` falls back to the module's own `SEED` array whenever no `vamosReviews` key
// exists in `localStorage` — which is exactly the state of a bare vm sandbox with no
// `localStorage` global at all (the `try { raw = localStorage.getItem(KEY); } catch (e) {}`
// swallows the ReferenceError and `parsed` stays null). `all()` already runs every row through
// the module's own `clean()`, which fills every default and derives `locked` — the same
// derivation `reviews.locked generated always as (source <> 'manual') stored` performs in SQL,
// so this generator never seeds `locked` itself (the truths this plan proves say so
// explicitly). `window.addEventListener` must exist before the IIFE runs — it registers a
// `storage` listener unconditionally at module load — so the sandbox stubs it as a no-op; no
// other window/DOM API is exercised by the `all()` code path.
function loadReviews() {
  const src = readFileSync(REVIEWS_PATH, "utf8");
  const sandbox = { window: { addEventListener() {} } };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: REVIEWS_PATH });
  const api = sandbox.window.VamosReviews;
  if (!api || typeof api.all !== "function") {
    throw new Error(`Could not load window.VamosReviews.all() from ${REVIEWS_PATH}`);
  }
  return api.all();
}

// ── One emitter per seed target — each hard-codes its own ON CONFLICT target (02-PATTERNS.md
// P7: "The generator's SQL-emitting functions should each hard-code their own conflict target
// as a constant, not infer it.") ────────────────────────────────────────────────────────────
function emitInsert({ table, columns, rows, conflictCols, doNothing = false, updateCols }) {
  const colList = columns.join(",\n  ");
  const valuesLines = rows.map((r) => `  (${r.join(", ")})`).join(",\n");
  const lines = [];
  lines.push(`insert into public.${table} (`);
  lines.push(`  ${colList}`);
  lines.push(`) values`);
  lines.push(valuesLines);
  if (doNothing) {
    lines.push(`on conflict (${conflictCols.join(", ")}) do nothing;`);
  } else {
    const setLines = updateCols.map((c) => `  ${c} = excluded.${c}`).join(",\n");
    lines.push(`on conflict (${conflictCols.join(", ")}) do update set`);
    lines.push(`${setLines};`);
  }
  return lines.join("\n");
}

function emitVehicleClasses() {
  // D-36 (ADR-014 §6): exactly Economy 3/3, Business 3/3, Van 8/8. No `first`, never the
  // mock's Van seats: 7 (research/seed-source-inventory.md's do-not-seed list).
  const rows = [
    ["economy", 3, 3, 1],
    ["business", 3, 3, 2],
    ["van", 8, 8, 3],
  ].map(([slug, pax, bags, sort]) => [q(slug), qint(pax), qint(bags), qint(sort), qb(true)]);
  return emitInsert({
    table: "vehicle_classes",
    columns: ["slug", "passenger_capacity", "luggage_capacity", "sort_order", "active"],
    rows,
    conflictCols: ["slug"],
    updateCols: ["passenger_capacity", "luggage_capacity", "sort_order", "active"],
  });
}

function emitServiceZones() {
  const zones = [
    ["zrh-airport", "ZRH"],
    ["gva-airport", "GVA"],
    ["zurich-city", null],
    ["dietikon", null],
    ["zermatt", null],
    ["st-moritz", null],
    ["chamonix", null],
    ["verbier", null],
  ];
  const rows = zones.map(([slug, iata]) => [q(slug), q(iata), qb(true)]);
  return emitInsert({
    table: "service_zones",
    columns: ["slug", "iata", "active"],
    rows,
    conflictCols: ["slug"],
    updateCols: ["iata", "active"],
  });
}

function emitSettings() {
  // ADR-014 §6: Visa, Mastercard, Apple Pay, Google Pay, TWINT — no cash. The mock's
  // `cash: true` must NOT be copied (research/seed-source-inventory.md do-not-seed list).
  const row = [
    qint(1),
    q(""),
    q(""),
    q(""),
    q(""),
    q(""),
    q("en"),
    q("CHF"),
    qb(false), // accepts_cash
    qb(true), // accepts_card
    qb(true), // accepts_twint
    qb(false), // accepts_invoice
    qb(true), // email_confirmation
    qb(true), // email_reminder
    qb(false), // sms_reminder
    qb(true), // ops_alerts
    qint(30), // D-14: chauffeur_turnaround_minutes
  ];
  return emitInsert({
    table: "settings",
    columns: [
      "id",
      "company",
      "address",
      "uid_number",
      "phone",
      "email",
      "default_lang",
      "default_currency",
      "accepts_cash",
      "accepts_card",
      "accepts_twint",
      "accepts_invoice",
      "email_confirmation",
      "email_reminder",
      "sms_reminder",
      "ops_alerts",
      "chauffeur_turnaround_minutes",
    ],
    rows: [row],
    conflictCols: ["id"],
    updateCols: [
      "company",
      "address",
      "uid_number",
      "phone",
      "email",
      "default_lang",
      "default_currency",
      "accepts_cash",
      "accepts_card",
      "accepts_twint",
      "accepts_invoice",
      "email_confirmation",
      "email_reminder",
      "sms_reminder",
      "ops_alerts",
      "chauffeur_turnaround_minutes",
    ],
  });
}

function emitSettingsVersions() {
  // D-35 (ADR-014 §5, 2026-08-22): the confirmed policy numbers. F-02: this table joined the
  // append-only set (Plan 02-07's …19_append_only.sql) — the conflict clause below is
  // therefore DO NOTHING, the only legal second write to an existing row.
  const cancellationTiers = [
    { from_hours_before: 24, refund_percent: 100 },
    { from_hours_before: 0, refund_percent: 75 },
    { no_show: true, refund_percent: 0 },
  ];
  const row = [
    q("launch-baseline"),
    q("Launch baseline — ADR-014 2026-08-22"),
    qint(24), // free_cancel_hours
    qNullOnly(null), // modification_deadline_hours — unconfirmed, ADR-002
    qint(180), // min_advance_minutes
    qint(60), // airport_waiting_minutes
    qint(15), // city_waiting_minutes
    qint(30), // manage_link_validity_days
    qint(10), // round_trip_discount_percent
    q("20:00"), // night_window_start
    q("06:00"), // night_window_end
    q("Europe/Zurich"), // night_window_tz
    qint(30), // quote_lock_minutes
    qint(30), // checkout_window_minutes
    qjsonb(cancellationTiers),
    q("cancellation"), // policy_doc_slug
    "null", // policy_doc_version — unconfirmed
  ];
  return emitInsert({
    table: "settings_versions",
    columns: [
      "slug",
      "label",
      "free_cancel_hours",
      "modification_deadline_hours",
      "min_advance_minutes",
      "airport_waiting_minutes",
      "city_waiting_minutes",
      "manage_link_validity_days",
      "round_trip_discount_percent",
      "night_window_start",
      "night_window_end",
      "night_window_tz",
      "quote_lock_minutes",
      "checkout_window_minutes",
      "cancellation_tiers",
      "policy_doc_slug",
      "policy_doc_version",
    ],
    rows: [row],
    conflictCols: ["slug"],
    doNothing: true,
  });
}

function emitRateVersion() {
  const row = [q("seed-placeholder"), q("Staging matrix — placeholder, not owner-approved"), q("draft"), q("")];
  return emitInsert({
    table: "rate_versions",
    columns: ["slug", "label", "status", "note"],
    rows: [row],
    conflictCols: ["slug"],
    updateCols: ["label", "status", "note"],
  });
}

function emitDistanceRates() {
  const rateVersionSub = `(select id from public.rate_versions where slug = ${q("seed-placeholder")})`;
  const classes = [
    ["economy", 3],
    ["business", 3],
    ["van", 8],
  ];
  const rows = classes.map(([slug, maxPax]) => [
    rateVersionSub,
    `(select id from public.vehicle_classes where slug = ${q(slug)})`,
    qNullOnly(null), // base_fare_rappen
    qNullOnly(null), // per_km_rappen
    qNullOnly(null), // min_fare_rappen
    qint(maxPax),
    qb(true), // available
  ]);
  return emitInsert({
    table: "distance_rates",
    columns: [
      "rate_version_id",
      "vehicle_class_id",
      "base_fare_rappen",
      "per_km_rappen",
      "min_fare_rappen",
      "max_pax",
      "available",
    ],
    rows,
    conflictCols: ["rate_version_id", "vehicle_class_id"],
    updateCols: ["base_fare_rappen", "per_km_rappen", "min_fare_rappen", "max_pax", "available"],
  });
}

function emitSurcharges() {
  const rateVersionSub = `(select id from public.rate_versions where slug = ${q("seed-placeholder")})`;
  // Codes and kinds per 02-09-PLAN.md's <interfaces> table. Labels/rules live in
  // content_strings (price.surcharge.<code>.label/.rule), never stored prose here (D-08).
  const surcharges = [
    ["airport_pickup", "amount"],
    ["night", "percent"],
    ["waiting_airport", "amount"],
    ["waiting_city", "amount"],
    ["extra_stop", "amount"],
    ["child_seat", "amount"],
    ["meet_greet", "included"],
    ["ski_rack", "amount"],
  ];
  const rows = surcharges.map(([code, kind]) => [
    rateVersionSub,
    q(code),
    q(kind),
    qNullOnly(null), // amount_rappen
    qNullOnly(null), // percent
    q("leg"), // applies_to — no booking-level surcharge in V1
    qb(true), // active
  ]);
  return emitInsert({
    table: "surcharges",
    columns: ["rate_version_id", "code", "kind", "amount_rappen", "percent", "applies_to", "active"],
    rows,
    conflictCols: ["rate_version_id", "code"],
    updateCols: ["kind", "amount_rappen", "percent", "applies_to", "active"],
  });
}

function buildContentRows() {
  const en = loadLocale("en");
  const de = loadLocale("de");
  const fr = loadLocale("fr");
  const ar = loadLocale("ar");
  const flatEn = flatten(en);
  const flatDe = flatten(de);
  const flatFr = flatten(fr);
  const flatAr = flatten(ar);
  const meta = en.$meta || { pendingValueKeys: [], nonTranslatableKeys: [], noParamKeys: {} };
  const pendingSet = new Set(meta.pendingValueKeys);
  const nonTranslatableSet = new Set(meta.nonTranslatableKeys);

  const keys = Object.keys(flatEn).sort();
  return keys.map((key) => {
    if (flatEn[key] === undefined) throw new Error(`en.json has no value for flattened key ${key}`);
    const isNonTranslatable = nonTranslatableSet.has(key);
    let deVal = flatDe[key];
    let frVal = flatFr[key];
    let arVal = flatAr[key];
    // ADR-012: a non-translatable key (product name, payment mark) is literal in every
    // language. Measured today (research/seed-source-inventory.md) at zero drift — the Phase 1
    // dictionary migration already back-filled these four locale files identically — but this
    // fallback stays so a future edit to one locale file alone degrades to the documented
    // behaviour instead of silently NULLing a row Law 03 requires to be visible.
    if (isNonTranslatable) {
      if (deVal === undefined) deVal = flatEn[key];
      if (frVal === undefined) frVal = flatEn[key];
      if (arVal === undefined) arVal = flatEn[key];
    }
    return {
      key,
      en: flatEn[key],
      de: deVal === undefined ? null : deVal,
      fr: frVal === undefined ? null : frVal,
      ar: arVal === undefined ? null : arVal,
      pending_value: pendingSet.has(key),
      non_translatable: isNonTranslatable,
      no_param_reason: meta.noParamKeys && meta.noParamKeys[key] ? meta.noParamKeys[key] : null,
    };
  });
}

function emitContentStrings(contentRows) {
  const rows = contentRows.map((r) => [
    q(r.key),
    q(r.en),
    q(r.de),
    q(r.fr),
    q(r.ar),
    qb(r.pending_value),
    qb(r.non_translatable),
    q(r.no_param_reason),
  ]);
  return emitInsert({
    table: "content_strings",
    columns: ["key", "en", "de", "fr", "ar", "pending_value", "non_translatable", "no_param_reason"],
    rows,
    conflictCols: ["key"],
    updateCols: ["en", "de", "fr", "ar", "pending_value", "non_translatable", "no_param_reason"],
  });
}

function buildReviewRows() {
  const seed = loadReviews();
  return seed.map((r, i) => ({
    external_ref: r.id,
    source: r.source,
    author_name: r.name,
    author_role: r.role,
    body: r.text,
    rating: r.rating,
    route_label: r.route,
    vehicle_class_slug: String(r.vehicleClass || "").toLowerCase(),
    avatar_path: r.avatar ? r.avatar : null,
    source_url: r.url ? r.url : null,
    verified: !!r.verified,
    published: r.published !== false,
    sort_order: i + 1,
  }));
}

function emitReviews(reviewRows) {
  const rows = reviewRows.map((r) => [
    q(r.external_ref),
    q(r.source),
    q(r.author_name),
    q(r.author_role),
    q(r.body),
    qint(r.rating),
    q(r.route_label),
    `(select id from public.vehicle_classes where slug = ${q(r.vehicle_class_slug)})`,
    q(r.avatar_path),
    q(r.source_url),
    qb(r.verified),
    qb(r.published),
    qint(r.sort_order),
  ]);
  return emitInsert({
    table: "reviews",
    columns: [
      "external_ref",
      "source",
      "author_name",
      "author_role",
      "body",
      "rating",
      "route_label",
      "vehicle_class_id",
      "avatar_path",
      "source_url",
      "verified",
      "published",
      "sort_order",
    ],
    rows,
    conflictCols: ["external_ref"],
    updateCols: [
      "source",
      "author_name",
      "author_role",
      "body",
      "rating",
      "route_label",
      "vehicle_class_id",
      "avatar_path",
      "source_url",
      "verified",
      "published",
      "sort_order",
    ],
  });
}

function main() {
  const contentRows = buildContentRows();
  const reviewRows = buildReviewRows();

  const counts = {
    vehicle_classes: 3,
    service_zones: 8,
    settings: 1,
    settings_versions: 1,
    rate_versions: 1,
    distance_rates: 3,
    surcharges: 8,
    content_strings: contentRows.length,
    reviews: reviewRows.length,
  };
  const pendingCount = contentRows.filter((r) => r.pending_value).length;
  const nonTranslatableCount = contentRows.filter((r) => r.non_translatable).length;
  const noParamCount = contentRows.filter((r) => r.no_param_reason !== null).length;

  const header = [
    "-- GENERATED by packages/db/seed/generate-seed.mjs -- do not edit by hand (D-22).",
    "-- Regenerate: pnpm db:seed:gen",
    "--",
    `-- Row counts: vehicle_classes=${counts.vehicle_classes} service_zones=${counts.service_zones} settings=${counts.settings} settings_versions=${counts.settings_versions} rate_versions=${counts.rate_versions} distance_rates=${counts.distance_rates} surcharges=${counts.surcharges} content_strings=${counts.content_strings} reviews=${counts.reviews}`,
    `-- content_strings: pending_value=${pendingCount} non_translatable=${nonTranslatableCount} no_param_reason=${noParamCount}`,
    "--",
    "-- D-34/D-09 (Law 04): every *_rappen/percent column below is the literal null; no",
    "-- rate_versions row is status = draft's opposite value here -- the CHF matrix is still",
    "-- open and no snapshot may be chargeable until the owner approves real numbers.",
    "--",
    "-- D-27/U3: whether `supabase db push --include-seed` re-runs this file on every push is",
    "-- still unresolved (research/local-toolchain-probe.md, a --linked probe barred locally).",
    "-- Every insert below is ON CONFLICT on a natural key, so this seed is idempotent under",
    "-- either answer. The one exception is settings_versions (F-02, append-only): its conflict",
    "-- clause is DO NOTHING, never DO UPDATE, so a second run skips an existing row instead of",
    "-- attempting a forbidden UPDATE.",
    "--",
    "-- D-27 test hook: every insert below lives inside public.__seed_apply() so",
    "-- supabase/tests/seed_idempotent.test.sql can re-run the whole seed a second time inside",
    "-- one pgTAP transaction (`select public.__seed_apply();`) without shelling out to psql.",
  ].join("\n");

  const body = [
    emitVehicleClasses(),
    emitServiceZones(),
    emitSettings(),
    emitSettingsVersions(),
    emitRateVersion(),
    emitDistanceRates(),
    emitSurcharges(),
    emitContentStrings(contentRows),
    emitReviews(reviewRows),
  ].join("\n\n");

  const output =
    [
      header,
      "",
      "begin;",
      "",
      "create or replace function public.__seed_apply() returns void",
      "language plpgsql security definer set search_path = '' as $f$",
      "begin",
      indent(body, "  "),
      "end",
      "$f$;",
      "",
      "revoke all on function public.__seed_apply() from public;",
      "",
      "select public.__seed_apply();",
      "",
      "commit;",
    ].join("\n") + "\n";

  if (CHECK) {
    const current = existsSync(OUT_PATH) ? readFileSync(OUT_PATH, "utf8") : "";
    if (current !== output) {
      console.error("DRIFT: packages/db/supabase/seed.sql differs from what the generator would produce -- re-run `pnpm db:seed:gen`.");
      process.exit(1);
    }
    console.log("generate-seed --check: no drift.");
    return;
  }

  writeFileSync(OUT_PATH, output);
  console.log(`Wrote ${OUT_PATH}`);
  console.log(
    `  vehicle_classes=${counts.vehicle_classes} service_zones=${counts.service_zones} settings=${counts.settings} settings_versions=${counts.settings_versions} rate_versions=${counts.rate_versions} distance_rates=${counts.distance_rates} surcharges=${counts.surcharges} content_strings=${counts.content_strings} reviews=${counts.reviews}`,
  );
  console.log(`  pending_value=${pendingCount} non_translatable=${nonTranslatableCount} no_param_reason=${noParamCount}`);
}

function indent(text, prefix) {
  return text
    .split("\n")
    .map((line) => (line.length ? prefix + line : line))
    .join("\n");
}

main();
