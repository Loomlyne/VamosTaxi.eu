// apps/web/tests/integration/content-loader-parity.spec.ts
//
// I18N-07 loader half. Tagged @i18n. component-1440 only.
// Builds the message object from content_strings and from the JSON files,
// strips $meta on the JSON side, and asserts deep equality. A mismatch names
// the offending keys. Skips when local Postgres is down — do not start Docker
// from this spec; run `pnpm db:start && pnpm db:reset` from packages/db.
//
// JSON kill-switch and unreachable-DB fallback are asserted in
// apps/web/lib/content/messages.test.ts (no Hyperdrive, no Docker).

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { unflattenKeys, type ContentLocale } from "../../lib/content/messages";
import { WEB_ROOT } from "../support/server-harness";

const RUN_PROJECT = "component-1440";
const LOCALES: ContentLocale[] = ["en", "de", "fr", "ar"];
const MAIN_DB_PKG = "/Users/koss/Developer/VamosTaxi.eu/packages/db/package.json";
const DB_URL =
  process.env.OPS_FIXTURE_DB_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";
const SKIP_HINT = "local Postgres is down — run pnpm db:start && pnpm db:reset from packages/db";

type ContentStringRow = {
  key: string;
  en: string;
  de: string | null;
  fr: string | null;
  ar: string | null;
};

function flatten(obj: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (prefix: string, value: unknown) => {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      for (const k of Object.keys(value as Record<string, unknown>)) {
        walk(`${prefix}.${k}`, (value as Record<string, unknown>)[k]);
      }
      return;
    }
    out[prefix] = value as string;
  };
  for (const topKey of Object.keys(obj)) {
    if (topKey.startsWith("$")) continue;
    walk(topKey, obj[topKey]);
  }
  return out;
}

function stripMeta(messages: Record<string, unknown>): Record<string, unknown> {
  if (!("$meta" in messages)) return messages;
  const { $meta: _meta, ...rest } = messages;
  return rest;
}

function loadJson(locale: ContentLocale): Record<string, unknown> {
  const raw = readFileSync(join(WEB_ROOT, "i18n/messages", `${locale}.json`), "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

function leafDiff(jsonFlat: Record<string, string>, dbFlat: Record<string, string>): string[] {
  const keys = new Set([...Object.keys(jsonFlat), ...Object.keys(dbFlat)]);
  const bad: string[] = [];
  for (const key of [...keys].sort()) {
    if (jsonFlat[key] !== dbFlat[key]) {
      bad.push(
        `${key}: json=${JSON.stringify(jsonFlat[key])} db=${JSON.stringify(dbFlat[key])}`,
      );
    }
  }
  return bad;
}

function loadSql() {
  const req = createRequire(MAIN_DB_PKG);
  const postgres = req("postgres") as (url: string) => {
    (strings: TemplateStringsArray, ...values: unknown[]): Promise<ContentStringRow[]>;
    end: (opts?: { timeout?: number }) => Promise<void>;
  };
  return postgres;
}

async function pingDb(): Promise<boolean> {
  const sql = loadSql()(DB_URL);
  try {
    await sql`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }
}

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== RUN_PROJECT, "Parity proofs run once under component-1440.");
});

test.describe("content loader parity @i18n", () => {
  test("unflattenKeys round-trips en.json minus $meta", async () => {
    const json = stripMeta(loadJson("en"));
    const flat = flatten(json);
    expect(unflattenKeys(flat)).toEqual(json);
  });

  test("DB-derived messages equal JSON-derived messages for en, de, fr, ar", async () => {
    const up = await pingDb();
    test.skip(!up, SKIP_HINT);

    const sql = loadSql()(DB_URL);
    let rows: ContentStringRow[] = [];
    try {
      rows = await sql`
        select key, en, de, fr, ar
          from public.content_strings
      `;
    } finally {
      await sql.end({ timeout: 5 }).catch(() => undefined);
    }

    test.skip(
      rows.length === 0,
      "content_strings is empty — run pnpm db:start && pnpm db:reset from packages/db",
    );

    const mismatches: string[] = [];
    for (const locale of LOCALES) {
      const jsonTree = stripMeta(loadJson(locale));
      const jsonFlat = flatten(jsonTree);
      const dbFlat: Record<string, string> = {};
      for (const row of rows) {
        // 26.1-10: migration 20260928130000 adds 26 canton display names that are not in the
        // JSON catalogue; canton_zones.test.sql pins them. Not part of the seed parity.
        if (row.key.startsWith("zone.canton-")) continue;
        const value = row[locale];
        if (value == null) continue;
        dbFlat[row.key] = value;
      }
      const dbTree = unflattenKeys(dbFlat);
      if (JSON.stringify(dbTree) !== JSON.stringify(jsonTree)) {
        mismatches.push(...leafDiff(jsonFlat, dbFlat).map((line) => `${locale} ${line}`));
      }
    }

    expect(mismatches, mismatches.join("\n")).toEqual([]);
  });
});
