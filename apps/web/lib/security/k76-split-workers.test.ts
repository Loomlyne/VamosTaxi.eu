import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");

function source(rel: string): string {
  return readFileSync(join(webRoot, rel), "utf8");
}

describe("K76 split Workers", () => {
  it("staging vamos does not bind dashboard hostname", () => {
    const wrangler = source("wrangler.jsonc");
    const staging = wrangler.slice(
      wrangler.indexOf('"staging"'),
      wrangler.indexOf('"ops-changes"'),
    );
    expect(staging).toMatch(/"VAMOS_SURFACE":\s*"public"/);
    expect(staging).toMatch(/"workers_dev":\s*false/);
    expect(staging).not.toMatch(
      /"pattern":\s*"dashboard\.vamostaxi\.site"/,
    );
    expect(staging).toMatch(/"pattern":\s*"vamostaxi\.site"/);
    expect(staging).toMatch(/"pattern":\s*"www\.vamostaxi\.site"/);
  });

  it("vamos-dashboard binds dashboard only and service-binds Dashboard entrypoint", () => {
    const dash = source("wrangler.dashboard.jsonc");
    expect(dash).toMatch(/"name":\s*"vamos-dashboard"/);
    expect(dash).toMatch(/"workers_dev":\s*false/);
    expect(dash).toMatch(/"pattern":\s*"dashboard\.vamostaxi\.site"/);
    expect(dash).not.toMatch(/"pattern":\s*"vamostaxi\.site"/);
    expect(dash).toContain('"binding": "APP"');
    expect(dash).toContain('"binding": "PUBLIC"');
    expect(dash).toContain('"service": "vamos"');
    expect(dash).toContain('"entrypoint": "Dashboard"');
    expect(dash).not.toMatch(/queues/);
    expect(dash).not.toMatch(/crons/);
  });

  it("worker.ts exports Dashboard entrypoint and does not put cron on the gateway", () => {
    const worker = source("worker.ts");
    const gateway = source("dashboard-gateway.ts");
    expect(worker).toMatch(/export class Dashboard extends WorkerEntrypoint/);
    expect(worker).toContain("expireUnpaidBookings");
    expect(worker).toContain("pinRequestToApexAssets");
    expect(gateway).toContain("env.APP.fetch");
    expect(gateway).toContain("env.PUBLIC.fetch");
    expect(gateway).not.toContain("expireUnpaidBookings");
  });

  it("ops-changes is not bound to dashboard hostname", () => {
    const wrangler = source("wrangler.jsonc");
    const ops = wrangler.slice(wrangler.indexOf('"ops-changes"'));
    expect(ops).not.toMatch(/"pattern":\s*"dashboard\.vamostaxi\.site"/);
  });

  it("preview envs do not bind staging Hyperdrive (K96)", () => {
    const wrangler = source("wrangler.jsonc");
    const front = wrangler.slice(
      wrangler.indexOf('"front"'),
      wrangler.indexOf('"staging": {'),
    );
    const ops = wrangler.slice(
      wrangler.indexOf('"ops-changes"'),
      wrangler.indexOf('"production": {'),
    );
    expect(front).not.toMatch(/HYPERDRIVE/);
    expect(ops).not.toMatch(/HYPERDRIVE/);
    expect(front).not.toMatch(/vamos-photos-staging/);
    expect(ops).not.toMatch(/vamos-photos-staging/);
    expect(front).toMatch(/"workers_dev":\s*false/);
    expect(ops).toMatch(/"workers_dev":\s*false/);
  });
});
