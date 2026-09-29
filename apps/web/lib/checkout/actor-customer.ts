// 26.3 (D-32): the customer a checkout booking belongs to. Identity comes only
// from the Supabase session cookie (`auth.getUser()` sub), never from the
// request body. No session, no customers row, or a lookup error → guest
// (null); the booking still proceeds.

import { asCheckout } from "../db/identity";
import { withRequestContext } from "../logger";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ActorCustomerDeps = {
  /** Signed-in claims from the Supabase cookie, or null. */
  claims: () => Promise<{ sub: string } | null>;
  /** customers.id for an auth user id, or null when there is no row. */
  lookup: (userId: string) => Promise<string | null>;
  /** Structured error sink. */
  onError?: (err: unknown) => void;
};

/** Pure core of {@link resolveActorCustomerId}; never throws. */
export async function resolveActorCustomerIdWithDeps(deps: ActorCustomerDeps): Promise<string | null> {
  let sub: string | null = null;
  try {
    const claims = await deps.claims();
    sub = claims?.sub ?? null;
  } catch {
    return null;
  }
  if (!sub || !UUID_RE.test(sub)) return null;
  try {
    const id = await deps.lookup(sub);
    return typeof id === "string" && UUID_RE.test(id) ? id : null;
  } catch (err) {
    deps.onError?.(err);
    return null;
  }
}

/**
 * Resolves `bookings.customer_id` for a checkout request: Supabase session sub →
 * `public.customer_id_for_user` (definer, EXECUTE vamos_checkout only).
 */
export async function resolveActorCustomerId(
  env: CloudflareEnv,
  request: Request,
): Promise<string | null> {
  const emit = withRequestContext({
    requestId: request.headers.get("cf-ray") ?? crypto.randomUUID(),
    route: new URL(request.url).pathname,
    locale: null,
  });
  return resolveActorCustomerIdWithDeps({
    claims: async () => {
      // Dynamic: the session module pulls in @supabase/ssr + next/headers.
      const { customerClaims } = await import("../account/session");
      return customerClaims(request);
    },
    lookup: async (userId) => {
      const rows = await asCheckout(env, null, (sql) =>
        sql<{ id: string | null }[]>`select public.customer_id_for_user(${userId}::uuid) as id`,
      );
      return rows[0]?.id ?? null;
    },
    onError: () => emit("error", "actor_customer_lookup_failed", {}),
  });
}
