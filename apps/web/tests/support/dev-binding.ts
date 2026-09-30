// Shared plumbing for the specs that start their own `next dev` and need the database
// through the Worker bindings (sign-up writes the agreement record via `asSystem`, which
// reads env.HYPERDRIVE_NOCACHE). The top-level wrangler config has no hyperdrive block, so
// the dev server is started on the `staging` env (VAMOS_DEV_WRANGLER_ENV, see next.config.ts).
//
// Defaults keep the specs on the default local stack (db 54322, mail 54324). A second,
// port-shifted stack is reached with VAMOS_TEST_DB_PORT / VAMOS_TEST_MAIL_PORT, and
// VAMOS_TEST_SUPABASE_WORKDIR for `supabase status` (API url and anon key).

export const TEST_DB_PORT = process.env.VAMOS_TEST_DB_PORT ?? "54322";
export const TEST_MAIL_PORT = process.env.VAMOS_TEST_MAIL_PORT ?? "54324";
export const MAIL_URL = `http://127.0.0.1:${TEST_MAIL_PORT}`;
export const OWNER_CS = `postgres://postgres:postgres@127.0.0.1:${TEST_DB_PORT}/postgres`;

/** Extra args for `supabase status`: the workdir of a non-default stack, when given. */
export function supabaseStatusArgs(): string[] {
  const workdir = process.env.VAMOS_TEST_SUPABASE_WORKDIR;
  return ["exec", "supabase", "status", "-o", "env", ...(workdir ? ["--workdir", workdir] : [])];
}

/** Environment for the spawned Next dev server: staging dev binding, and the DB connection when the port is overridden. */
export function devBindingEnv(): Record<string, string> {
  const env: Record<string, string> = { VAMOS_DEV_WRANGLER_ENV: "staging" };
  if (process.env.VAMOS_TEST_DB_PORT) {
    // Same roles as the staging `localConnectionString`s, on the overridden port. The password is the fixed
    // local one from packages/db/scripts/local-role-passwords.mjs (the committed wrangler string carries a
    // literal placeholder password that no local stack accepts).
    const at = `@127.0.0.1:${TEST_DB_PORT}/postgres`;
    env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE = `postgres://vamos_public:vamos_public${at}`;
    env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE_NOCACHE = `postgres://vamos_edge:vamos_edge${at}`;
  }
  return env;
}

/**
 * `initOpenNextCloudflareForDev()` is not awaited by next.config.ts, so on a cold server the first
 * request that calls `getCloudflareContext()` can land before the Worker bindings exist (500, and the
 * sign-up then reads as "sent" with no mail). Probe /api/auth with an unparseable body, which answers
 * 400 only once the context is there, and give up after `timeoutMs`.
 */
export async function waitForDevBindings(baseURL: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  let last = 0;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseURL}/api/auth`, {
        method: "POST",
        headers: { origin: baseURL, "content-type": "text/plain" },
        body: "not json",
      });
      last = res.status;
      if (res.status === 400) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Dev server at ${baseURL} has no Worker bindings after ${timeoutMs}ms (last status ${last}).`);
}

/** Compile the auth pages once up front; `next dev` compiles on first request and the 5 s assertions lose that race. */
export async function warmAuthPages(baseURL: string): Promise<void> {
  for (const path of ["/sign-up", "/sign-in", "/reset-password", "/de/sign-up"]) {
    await fetch(`${baseURL}${path}`).catch(() => undefined);
  }
}

/**
 * The `staging` env also declares AUTH_RATE_LIMITER (10 auth posts per 60 s per client IP), which the
 * top-level config did not. One run of these specs is more than 10 posts from one address, so each test
 * presents its own client IP, as separate visitors behind Cloudflare would.
 */
export function ownClientIpHeaders(): Record<string, string> {
  const b = () => Math.floor(Math.random() * 250) + 1;
  return { "cf-connecting-ip": `10.${b()}.${b()}.${b()}` };
}
