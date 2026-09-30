// apps/web/lib/health/probe.ts
//
// Authorized health body: { ok, db, payments, maps } booleans only.
// Fail closed per dependency. SELECT 1 on HYPERDRIVE_NOCACHE via asSystem.
// Stripe balance.retrieve is not a charge. Mapbox tokens/v2 is not geocode.
// A dependency that does not answer within HEALTH_PROBE_TIMEOUT_MS reads as
// down: worker.ts runs this in the hourly cron before the digest.

// Kept: scripts/check-db-access-fences.mjs (D-06) requires it on any importer
// of an identity wrapper.
export const dynamic = "force-dynamic";

import { stripeFromEnv } from "@/lib/checkout/stripe";
import { asSystem } from "@/lib/db/identity";

export type HealthProbeResult = {
  ok: boolean;
  db: boolean;
  payments: boolean;
  maps: boolean;
};

/** Per-dependency ceiling. Past it the dependency counts as down. */
export const HEALTH_PROBE_TIMEOUT_MS = 5_000;

function withTimeout(probe: Promise<boolean>): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), HEALTH_PROBE_TIMEOUT_MS);
  });
  return Promise.race([probe, timeout]).finally(() => clearTimeout(timer));
}

async function probeDb(env: CloudflareEnv): Promise<boolean> {
  try {
    await asSystem(env, async (sql) => {
      await sql`select 1`;
    });
    return true;
  } catch {
    return false;
  }
}

async function probePayments(env: CloudflareEnv): Promise<boolean> {
  try {
    await stripeFromEnv(env).balance.retrieve();
    return true;
  } catch {
    return false;
  }
}

async function probeMaps(env: CloudflareEnv): Promise<boolean> {
  try {
    const token = env.MAPBOX_TOKEN;
    if (!token) return false;
    const url = new URL("https://api.mapbox.com/tokens/v2");
    url.searchParams.set("access_token", token);
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

export async function probeHealth(env: CloudflareEnv): Promise<HealthProbeResult> {
  const [db, payments, maps] = await Promise.all([
    withTimeout(probeDb(env)),
    withTimeout(probePayments(env)),
    withTimeout(probeMaps(env)),
  ]);
  return { ok: db && payments && maps, db, payments, maps };
}
