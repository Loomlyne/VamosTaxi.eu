// apps/web/lib/health/probe.ts
//
// Authorized health body: { ok, db, payments, maps } booleans only.
// Fail closed per dependency. SELECT 1 on HYPERDRIVE_NOCACHE via asSystem.
// Stripe balance.retrieve is not a charge. Mapbox tokens/v2 is not geocode.

export const dynamic = "force-dynamic";

import { stripeFromEnv } from "@/lib/checkout/stripe";
import { asSystem } from "@/lib/db/identity";

export type HealthProbeResult = {
  ok: boolean;
  db: boolean;
  payments: boolean;
  maps: boolean;
};

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
    probeDb(env),
    probePayments(env),
    probeMaps(env),
  ]);
  return { ok: db && payments && maps, db, payments, maps };
}
