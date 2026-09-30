// apps/web/lib/consent/record.test.ts
//
// Wave 0 (10-01): D-03 record_consent contract. Bind helper lands in 10-02.
// customer_id is never an RPC argument. No sk_live_. No invented CHF.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function readRepo(rel: string): string {
  const path = join(repoRoot, rel);
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8");
}

describe("record_consent SQL (D-03)", () => {
  it("is the only write; subject from GUC; customer_id never an argument", () => {
    const sql = readRepo(
      "packages/db/supabase/migrations/20260823000018_consent_log.sql",
    );
    expect(sql).toMatch(/create or replace function public\.record_consent\(/);
    expect(sql).toMatch(/request\.vamos\.consent_subject/);
    expect(sql).not.toMatch(/p_customer_id/);
    expect(sql).not.toMatch(/p_consent_subject/);
    expect(sql).toMatch(/method in\s*\(\s*'accept_all','reject_all','save_choices','settings_change'\s*\)/);
  });
});

describe("bind helper + policy stamp (D-03, D-04)", () => {
  it("runs set_config then record_consent on the same tx", () => {
    const src = readRepo("apps/web/lib/consent/bind.ts");
    expect(src).toMatch(/set_config/);
    expect(src).toMatch(/request\.vamos\.consent_subject/);
    expect(src).toMatch(/record_consent/);
    expect(src).not.toMatch(/p_customer_id|customer_id\s*:/);
    expect(src).not.toMatch(/from ["']@vamos\/db["']/);
    expect(src).not.toMatch(/sk_live_/);
    expect(src).not.toMatch(/\bCHF\b/);
  });

  it("maps Accept → accept_all, Dismiss → reject_all, /cookies → settings_change; never save_choices", () => {
    const src = readRepo("apps/web/lib/consent/bind.ts");
    expect(src).toMatch(/accept_all/);
    expect(src).toMatch(/reject_all/);
    expect(src).toMatch(/settings_change/);
    expect(src).not.toMatch(/save_choices/);
  });

  it("passes the categories from the choice, necessary always true (27 D-05, D-18)", () => {
    const bind = readRepo("apps/web/lib/consent/bind.ts");
    expect(bind).toMatch(/input\.categories\.functional/);
    expect(bind).toMatch(/input\.categories\.analytics/);
    expect(bind).toMatch(/input\.categories\.marketing/);
    expect(bind).toMatch(/\$\{true\}/);
    const route = readRepo("apps/web/app/api/consent/route.ts");
    expect(route).toMatch(/categoriesForChoice\(/);
    expect(route).toMatch(/categories/);
  });

  it("policy_version is a dated stamp constant, not legal prose", () => {
    const src = readRepo("apps/web/lib/consent/policy.ts");
    expect(src).toMatch(/CONSENT_POLICY_VERSION/);
    expect(src).toMatch(/20\d{2}-\d{2}-\d{2}/);
    expect(src).not.toMatch(/nFADP|GDPR|Bundesgesetz|Datenschutz/);
    expect(src).not.toMatch(/\bCHF\b/);
  });
});

describe("POST /api/consent HTTP mapping (D-03, D-11, D-14)", () => {
  it("exists as force-dynamic POST using asAnon + recordConsent", () => {
    const src = readRepo("apps/web/app/api/consent/route.ts");
    expect(src).toMatch(/export const dynamic = ["']force-dynamic["']/);
    expect(src).toMatch(/export async function POST/);
    expect(src).toMatch(/from ["']@\/lib\/db\/identity["']/);
    expect(src).toMatch(/\basAnon\b/);
    expect(src).toMatch(/recordConsent/);
    expect(src).not.toMatch(/from ["']@vamos\/db["']/);
    expect(src).not.toMatch(/from ["']@vamos\/db\//);
    expect(src).not.toMatch(/Sentry|@sentry/);
    expect(src).not.toMatch(/sk_live_/);
    expect(src).not.toMatch(/\bCHF\b/);
    expect(src).not.toMatch(/save_choices/);
  });

  it("Turnstile iff the row will have marketing true; reject_all never (27 D-33)", () => {
    const route = readRepo("apps/web/app/api/consent/route.ts");
    const turnstile = readRepo("apps/web/lib/turnstile.ts");
    const post = route.slice(route.indexOf("export async function POST"));
    expect(turnstile).toMatch(/TurnstileAction = [\s\S]*consent/);
    expect(post).toMatch(/verifyTurnstile/);
    expect(post).toMatch(/action:\s*["']consent["']/);
    expect(post).toMatch(/challenge_failed/);
    expect(post).toMatch(/403/);
    expect(route).not.toMatch(/from ["']@\/lib\/abuse\/turnstile["']/);
    expect(post).toMatch(/accept_all/);
    expect(post).toMatch(/reject_all/);
    expect(post).toMatch(/settings_change/);
    const verifyAt = post.indexOf("verifyTurnstile");
    expect(verifyAt).toBeGreaterThan(-1);
    const verifyBlock = post.slice(post.lastIndexOf("if", verifyAt), verifyAt);
    expect(verifyBlock).toMatch(/needsTurnstile\(categories\)/);
    expect(verifyBlock).not.toMatch(/reject_all/);
    const choice = readRepo("apps/web/lib/consent/choice.ts");
    expect(choice).toMatch(/marketing === true/);
  });

  it("rate-limits consent:${ip} and consent:${ip}:${subject} before write", () => {
    const src = readRepo("apps/web/app/api/consent/route.ts");
    const post = src.slice(src.indexOf("export async function POST"));
    expect(post).toMatch(/checkWriteRateLimit/);
    expect(post).toMatch(/kind:\s*["']consent["']/);
    expect(post).toMatch(/rate_limited/);
    expect(post).toMatch(/429/);
    const limitAt = post.indexOf("checkWriteRateLimit");
    const writeAt = post.indexOf("recordConsent");
    expect(limitAt).toBeGreaterThan(-1);
    expect(writeAt).toBeGreaterThan(limitAt);
  });

  it("sets consent_subject on POST success only; truncates cf-connecting-ip", () => {
    const src = readRepo("apps/web/app/api/consent/route.ts");
    expect(src).toMatch(/consentSubjectSetCookie/);
    expect(src).toMatch(/mintConsentSubject|readConsentSubject/);
    expect(src).toMatch(/truncateClientIp/);
    expect(src).toMatch(/cfConnectingIp|cf-connecting-ip/);
    expect(src).toMatch(/Cache-Control["']:\s*["']private, no-store["']|["']Cache-Control["'],\s*["']private, no-store["']/);
    if (src.includes("export async function GET") || src.includes("export function GET")) {
      const getAt = src.search(/export (async )?function GET/);
      const postAt = src.indexOf("export async function POST");
      const getSrc = src.slice(getAt, postAt > getAt ? postAt : undefined);
      expect(getSrc).toMatch(/405/);
      expect(getSrc).not.toMatch(/consentSubjectSetCookie|mintConsentSubject/);
    }
  });
});

describe("sign-up writes no cookie row (27 D-01)", () => {
  it("no file under app/api/auth or lib/auth references recordConsent or record_consent", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      );
    const files = [
      ...walk(join(repoRoot, "apps/web/app/api/auth")),
      ...walk(join(repoRoot, "apps/web/lib/auth")),
    ].filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/recordConsent|record_consent/);
    }
    expect(existsSync(join(repoRoot, "apps/web/lib/auth/signup-consent.ts"))).toBe(false);
  });

  it("the pending flag is gone", () => {
    for (const f of ["apps/web/lib/auth/run.ts", "apps/web/lib/supabase/constants.ts"]) {
      expect(readRepo(f), f).not.toMatch(/signup_consent|SIGNUP_CONSENT_METADATA_KEY/);
    }
  });
});
