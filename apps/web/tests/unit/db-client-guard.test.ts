import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// 26.0 D-07: database tests open their connection through the Worker-options helper
// (packages/db/test/support/worker-client.ts) so a test cannot pass on options the Worker never
// uses (VT-26-0733: text[] arrived as a string on the Worker client and default-option tests
// hid it). This guard fails on a raw Postgres client constructed anywhere else, and on a
// hard-coded stack port outside the stack helpers. Every exemption carries a reason, and an
// exemption whose file no longer matches fails too, so the list cannot go stale.

const REPO = join(__dirname, "..", "..", "..", "..");
const SCAN_DIRS = ["apps/web/tests", "packages/db/test"];
const SELF = "apps/web/tests/unit/db-client-guard.test.ts";

const CONSTRUCTION = [
  /(^|[^\w.$])postgres(<[^>]*>)?\(/, // postgres(url, ...) or a template-string child script
  /requireFromWorktree\(\s*"postgres"\s*\)/, // resolves the driver to build a client by hand
  /\bloadSql\(\)/, // local wrapper of the line above
];
// DB / API stack ports: 5x32y (54321, 55322, 58322 ...) and the bare 5432.
const PORT = /\b5\d32\d\b|\b5432\b/;

const HELPERS = new Set([
  "packages/db/test/support/worker-client.ts",
  "packages/db/test/support/test-stack-guard.ts",
]);
const PORT_HELPERS = new Set([...HELPERS, "apps/web/tests/support/test-stack.ts"]);

/** Client constructions that are deliberate. file -> reason. */
const CLIENT_EXEMPT: Record<string, string> = {
  "apps/web/tests/support/ops-fixtures.ts":
    "ops fixture seeds and cleans rows as the database owner; staff/bookings have no INSERT for the Worker roles by design",
  "apps/web/tests/integration/content-string-edit.spec.ts":
    "owner-role fixture reads and restores content_strings around a UI edit; the assertion runs through the app",
  "apps/web/tests/integration/ops-claims-bridge.spec.ts":
    "owner-role insertStaff: public.staff has no INSERT grant for service_role (42501 by design)",
  "apps/web/tests/integration/auth-flows.spec.ts":
    "owner-role fixture in a child node script that reads auth tokens; assertions go through the app",
  "apps/web/tests/integration/home-content.spec.ts":
    "owner-role fixture that seeds and deletes one review row; the assertion reads the rendered page",
  "apps/web/tests/integration/contact-form.spec.ts":
    "owner-role fixture in a child node script that reads the stored ticket; the submit goes through the app",
  "packages/db/test/fixtures/two-customers.ts":
    "deployed-context fixture: owner connection from VAMOS_OWNER_URL writes rows only, never an assertion connection (fetch_types off like the Worker)",
  "packages/db/test/local/worker-client-parity.test.ts":
    "the parity test itself: builds default-option control clients on purpose to prove the helper differs from them",
};

/** Literal ports that are deliberate. file -> reason. */
const PORT_EXEMPT: Record<string, string> = {
  "packages/db/test/deployed/config-preconditions.test.ts":
    "asserts the deployed Hyperdrive origin uses Postgres port 5432 rather than 6543; not a local stack port",
  "apps/web/tests/integration/checkout-server-db.spec.ts":
    "documented 55322 default so the 26.3 workflow works with no env; VAMOS_TEST_DB_PORT overrides",
  "apps/web/tests/integration/intent-supersede-db.spec.ts":
    "documented 55322 default so the 26.3 workflow works with no env; VAMOS_TEST_DB_PORT overrides",
  "apps/web/tests/integration/extras-charged-recorded-db.spec.ts":
    "documented 55322 default so the 26.3 workflow works with no env; VAMOS_TEST_DB_PORT overrides",
  "packages/db/test/local/worker-client-parity.test.ts":
    "CI stack default 54322 when VAMOS_TEST_DB_PORT is unset",
  "apps/web/tests/support/dev-binding.ts":
    "Phase 27 helper: documented 54322/54324 defaults, VAMOS_TEST_DB_PORT / VAMOS_TEST_MAIL_PORT override (devBindingEnv throws without the DB port)",
  "packages/db/test/local/consent-reader.test.ts":
    "Phase 27 default 59322 when VAMOS_LOCAL_DB_PORT is unset (same pattern as worker-arrays)",
  "packages/db/test/local/signup-agreement.test.ts":
    "CI stack default 54322 when VAMOS_LOCAL_DB_PORT is unset (same as worker-arrays)",
  "packages/db/test/local/checkout-account.test.ts":
    "CI stack default 54322 when VAMOS_LOCAL_DB_PORT is unset (same as worker-arrays)",
  "packages/db/test/local/worker-arrays.test.ts":
    "CI stack default 54322 when VAMOS_LOCAL_DB_PORT is unset",
  "packages/db/test/local/test-stack-guard.test.ts":
    "feeds the marker guard wrong ports on purpose to prove it refuses them",
};

/** Lines that name the Supabase API URL, not a database port. */
const API_FALLBACK =
  /SUPABASE_URL: process\.env\.SUPABASE_URL \?\? "http:\/\/127\.0\.0\.1:54321"/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.endsWith("-snapshots") || name === "test-results") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts)$/.test(name)) out.push(p);
  }
  return out;
}

const files = SCAN_DIRS.flatMap((d) => walk(join(REPO, d)))
  .map((p) => relative(REPO, p).split(sep).join("/"))
  .filter((f) => f !== SELF);

function codeLines(file: string): { n: number; text: string }[] {
  return readFileSync(join(REPO, file), "utf8")
    .split("\n")
    .map((text, i) => ({ n: i + 1, text }))
    .filter(({ text }) => !/^\s*(\/\/|\*|\/\*)/.test(text));
}

const clientHits = new Map<string, string[]>();
const portHits = new Map<string, string[]>();
for (const f of files) {
  for (const { n, text } of codeLines(f)) {
    if (CONSTRUCTION.some((re) => re.test(text))) {
      clientHits.set(f, [...(clientHits.get(f) ?? []), `${f}:${n}`]);
    }
    if (PORT.test(text) && !API_FALLBACK.test(text)) {
      portHits.set(f, [...(portHits.get(f) ?? []), `${f}:${n}`]);
    }
  }
}

describe("db client guard (D-07)", () => {
  it("scans a non-empty set of test files", () => {
    expect(files.length).toBeGreaterThan(80);
    expect(files).toContain("packages/db/test/support/worker-client.ts");
  });

  it("no test file constructs a Postgres client outside the helpers or a reasoned fixture", () => {
    const bad = [...clientHits.entries()]
      .filter(([f]) => !HELPERS.has(f) && !(f in CLIENT_EXEMPT))
      .flatMap(([, lines]) => lines);
    expect(bad, "use workerSql() from packages/db/test/support/worker-client.ts").toEqual([]);
  });

  it("no test file hard-codes a stack port outside the stack helpers or a reasoned default", () => {
    const bad = [...portHits.entries()]
      .filter(([f]) => !PORT_HELPERS.has(f) && !(f in PORT_EXEMPT))
      .flatMap(([, lines]) => lines);
    expect(bad, "read the port from testDbPort() / VAMOS_TEST_DB_PORT").toEqual([]);
  });

  it("every exemption has a reason and still matches its file (no stale exemptions)", () => {
    const stale: string[] = [];
    for (const [f, reason] of Object.entries(CLIENT_EXEMPT)) {
      if (reason.length < 20) stale.push(`${f}: reason too short`);
      if (!clientHits.has(f)) stale.push(`${f}: no client construction any more (client exemption)`);
    }
    for (const [f, reason] of Object.entries(PORT_EXEMPT)) {
      if (reason.length < 20) stale.push(`${f}: reason too short`);
      if (!portHits.has(f)) stale.push(`${f}: no literal port any more (port exemption)`);
    }
    expect(stale).toEqual([]);
  });

  it("the shared helper still constructs the client", () => {
    expect(clientHits.has("packages/db/test/support/worker-client.ts")).toBe(true);
  });
});
