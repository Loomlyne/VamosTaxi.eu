// Auth cookie rename (2026-10-04): both Worker doors (public default export and the Dashboard
// entrypoint the gateway calls) must answer through handleFetch, which expires old sb-*-auth-token
// cookies. A new door that skips it would leave the old cookies in browsers.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "../../worker.ts"), "utf8");

/** Body of the first `fetch(` method after `marker`, up to its closing brace at the same indent. */
function fetchBodyAfter(marker: string): string {
  const start = src.indexOf(marker);
  expect(start, `${marker} in worker.ts`).toBeGreaterThanOrEqual(0);
  const rest = src.slice(start);
  const open = rest.search(/\bfetch\s*\(/);
  expect(open, `fetch( after ${marker}`).toBeGreaterThanOrEqual(0);
  return rest.slice(open, rest.indexOf("\n  }", open));
}

describe("worker.ts: every door goes through handleFetch", () => {
  it("handleFetch wraps the routed answer with withLegacyAuthCookiesExpired", () => {
    expect(src).toMatch(/import \{ withLegacyAuthCookiesExpired \} from "\.\/lib\/supabase\/cookies";/);
    const body = src.slice(src.indexOf("async function handleFetch("), src.indexOf("async function routeFetch("));
    expect(body).toMatch(/return withLegacyAuthCookiesExpired\(request, await routeFetch\(request, env, ctx, surface\)\);/);
  });

  it("Dashboard.fetch calls handleFetch", () => {
    const body = fetchBodyAfter("export class Dashboard extends WorkerEntrypoint");
    expect(body).toMatch(/return handleFetch\(request, this\.env, this\.ctx, "dashboard"\);/);
    expect(body).not.toMatch(/routeFetch|handler\.fetch/);
  });

  it("default.fetch calls handleFetch", () => {
    const body = fetchBodyAfter("export default {");
    expect(body).toMatch(/return handleFetch\(request, env, ctx, surfaceFromEnv\(env\)\);/);
    expect(body).not.toMatch(/routeFetch|handler\.fetch/);
  });

  it("nothing but handleFetch calls routeFetch", () => {
    expect(src.match(/routeFetch\(/g)).toHaveLength(2); // the definition and the one call in handleFetch
  });
});
