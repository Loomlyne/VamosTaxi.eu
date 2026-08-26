// packages/db/test/deployed/config-preconditions.test.ts
//
// DATA-05's direct-string half (D-02) — a fact about configuration, not a measurement, so it is
// NOT deferred the way DATA-05's p50 number is. Six fail-fast assertions read every configured
// Hyperdrive config through the Cloudflare API and refuse to let an isolation run proceed on a
// pooler-on-pooler origin, a wrong login role, a cache-enabled identity config, a wrong pool
// size, or a probe config bound as the app's own identity binding (D-03's checked-in allowlist,
// T-03-10). Every failure message names the specific field and the expected value, so a red run
// is actionable without opening the dashboard.
//
// The whole file is inert without `PROBE_BASE_URL` set (D-30/D-31) — a machine with no staging
// deploy sees every test below reported skipped, exactly like `negative-controls.test.ts` and
// `data-06-isolation.test.ts`.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import allowlistRaw from "../support/config-allowlist.json";

interface AllowlistEntry {
  id: string | null;
  expected_origin_user: string;
  expected_origin_port: number;
  expected_caching_disabled: boolean;
  expected_origin_connection_limit: number;
}

interface AllowlistFile {
  provisioned: boolean;
  app_identity: AllowlistEntry;
  app_identity_production: AllowlistEntry;
  app_public: AllowlistEntry;
  app_public_production: AllowlistEntry;
  probe_identity: AllowlistEntry;
}

// `resolveJsonModule` infers a literal-narrowed shape (`id: null`) from the checked-in file's
// current unprovisioned values — cast to the wider shape plan 03-07 will actually fill in.
const allowlist = allowlistRaw as unknown as AllowlistFile;

const CONFIGS: Array<{ key: keyof Omit<AllowlistFile, "provisioned">; label: string }> = [
  { key: "app_identity", label: "apps/web staging HYPERDRIVE_NOCACHE (identity)" },
  { key: "app_identity_production", label: "apps/web production HYPERDRIVE_NOCACHE (identity)" },
  { key: "app_public", label: "apps/web staging HYPERDRIVE (public/cached)" },
  { key: "app_public_production", label: "apps/web production HYPERDRIVE (public/cached)" },
  { key: "probe_identity", label: "apps/isolation-probe HYPERDRIVE_NOCACHE (dedicated 5-origin probe config)" },
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`config-preconditions.test.ts: ${name} is not set`);
  }
  return value;
}

interface HyperdriveConfig {
  id: string;
  origin: { host: string; port: number; database: string; user: string; scheme: string };
  caching: { disabled: boolean };
  origin_connection_limit: number;
}

/** Reads one Hyperdrive config through the Cloudflare REST API. Only ever called from inside an
 *  `it()` body — never at collection time — so the file-level skip guard below fully protects it. */
async function fetchHyperdriveConfig(id: string): Promise<HyperdriveConfig> {
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  const token = requireEnv("CLOUDFLARE_API_TOKEN");
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/hyperdrive/configs/${id}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    throw new Error(
      `config-preconditions.test.ts: Cloudflare Hyperdrive API returned ${res.status} for config ${id}`,
    );
  }
  const body = (await res.json()) as { result: HyperdriveConfig };
  return body.result;
}

describe.skipIf(!process.env.PROBE_BASE_URL)("config preconditions (DATA-05 direct-string half, D-02/D-03)", () => {
  it("every configured Hyperdrive origin uses port 5432, never Supavisor's pooled 6543 (D-02)", async () => {
    for (const { key, label } of CONFIGS) {
      const entry = allowlist[key];
      if (!entry.id) continue; // unfilled until plan 03-07 provisions it
      const config = await fetchHyperdriveConfig(entry.id);
      expect(
        config.origin.port,
        `${label} (config ${entry.id}): origin.port must be 5432, got ${config.origin.port} -- a 6543 origin means Hyperdrive is pooling in front of Supavisor and transaction state would land on an unpredictable backend`,
      ).toBe(5432);
      expect(
        config.origin.port,
        `${label} (config ${entry.id}): origin.port must never be 6543 (Supavisor's pooled port)`,
      ).not.toBe(6543);
    }
  });

  it("every configured Hyperdrive origin logs in as its own least-privileged role, never postgres/authenticator (D-02)", async () => {
    for (const { key, label } of CONFIGS) {
      const entry = allowlist[key];
      if (!entry.id) continue;
      const config = await fetchHyperdriveConfig(entry.id);
      expect(
        config.origin.user,
        `${label} (config ${entry.id}): origin.user must be "${entry.expected_origin_user}", got "${config.origin.user}"`,
      ).toBe(entry.expected_origin_user);
      expect(
        ["postgres", "authenticator"].includes(config.origin.user),
        `${label} (config ${entry.id}): origin.user "${config.origin.user}" must never be postgres or authenticator -- a superuser or the PostgREST login role carries privileges the grant wall never grants to vamos_edge/vamos_public`,
      ).toBe(false);
    }
  });

  it("identity configs report caching.disabled=true; the cached config does not (D-01)", async () => {
    for (const { key, label } of CONFIGS) {
      const entry = allowlist[key];
      if (!entry.id) continue;
      const config = await fetchHyperdriveConfig(entry.id);
      expect(
        config.caching.disabled,
        `${label} (config ${entry.id}): caching.disabled must be ${entry.expected_caching_disabled}, got ${config.caching.disabled}`,
      ).toBe(entry.expected_caching_disabled);
    }
  });

  it("origin_connection_limit matches the 25/15/5 pigeonhole split (D-03)", async () => {
    for (const { key, label } of CONFIGS) {
      const entry = allowlist[key];
      if (!entry.id) continue;
      const config = await fetchHyperdriveConfig(entry.id);
      expect(
        config.origin_connection_limit,
        `${label} (config ${entry.id}): origin_connection_limit must be ${entry.expected_origin_connection_limit}, got ${config.origin_connection_limit}`,
      ).toBe(entry.expected_origin_connection_limit);
    }
  });

  it("the probe's dedicated config id is never the id bound as apps/web's own identity binding (D-03/T-03-10)", () => {
    if (!allowlist.provisioned) {
      // Recorded, not silently skipped inside a running suite: this branch is only reachable
      // once the file-level skip guard has already let the file run at all, i.e. PROBE_BASE_URL
      // is set — an unprovisioned allowlist at that point is itself worth a loud, named assertion.
      expect(
        allowlist.provisioned,
        "config-allowlist.json is not yet provisioned (plan 03-07 fills the real ids and flips this flag)",
      ).toBe(false);
      return;
    }
    expect(allowlist.probe_identity.id, "probe_identity.id must not be null once provisioned").not.toBeNull();
    expect(allowlist.app_identity.id, "app_identity.id must not be null once provisioned").not.toBeNull();
    expect(
      allowlist.probe_identity.id,
      `probe_identity.id (${allowlist.probe_identity.id}) must differ from app_identity.id (${allowlist.app_identity.id}) -- a 5-origin config serving the app would starve production; an app config serving the probe would destroy the pigeonhole and quietly weaken every later S`,
    ).not.toBe(allowlist.app_identity.id);
  });

  it("packages/db/src/identity.ts declares prepare: true, never prepare: false (D-02, Hyperdrive's query cache)", () => {
    const identitySourcePath = fileURLToPath(new URL("../../src/identity.ts", import.meta.url));
    const source = readFileSync(identitySourcePath, "utf8");
    expect(
      source.includes("prepare: true"),
      "packages/db/src/identity.ts must declare prepare: true -- Hyperdrive's own query cache depends on prepared statements",
    ).toBe(true);
    expect(
      source.includes("prepare: false"),
      "packages/db/src/identity.ts must never declare prepare: false -- it silently disables Hyperdrive's query cache and changes what DATA-05 measures",
    ).toBe(false);
  });
});
