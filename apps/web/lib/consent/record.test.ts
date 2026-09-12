// apps/web/lib/consent/record.test.ts
//
// Wave 0 (10-01): D-03 record_consent contract. Bind helper lands in 10-02.
// customer_id is never an RPC argument. No sk_live_. No invented CHF.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function readRepo(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
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

  it("always records necessary true and functional/analytics/marketing false (D-03, D-05)", () => {
    const src = readRepo("apps/web/lib/consent/bind.ts");
    expect(src).toMatch(/necessary:\s*true|p_necessary:\s*true|true,\s*false,\s*false,\s*false/);
    expect(src).toMatch(/functional:\s*false|p_functional:\s*false/);
    expect(src).toMatch(/analytics:\s*false|p_analytics:\s*false/);
    expect(src).toMatch(/marketing:\s*false|p_marketing:\s*false/);
  });

  it("policy_version is a dated stamp constant, not legal prose", () => {
    const src = readRepo("apps/web/lib/consent/policy.ts");
    expect(src).toMatch(/CONSENT_POLICY_VERSION/);
    expect(src).toMatch(/20\d{2}-\d{2}-\d{2}/);
    expect(src).not.toMatch(/nFADP|GDPR|Bundesgesetz|Datenschutz/);
    expect(src).not.toMatch(/\bCHF\b/);
  });
});
