// packages/db/test/support/test-stack-guard.ts
//
// Proves a test is talking to a throwaway local stack before it reads or writes.
// Three checks: loopback host, the expected port, and a cluster-level marker role that
// only scripts/mark-test-stack.mjs creates (never present on a hosted project).
import postgres from "postgres";

export const TEST_STACK_MARKER_ROLE = "vamos_throwaway_test_stack";

/**
 * Throws unless `url` is a loopback database on `expectedPort` that carries the marker role.
 * Host and port are checked before any connection is opened.
 */
export async function assertThrowawayTestStack(
  url: string,
  expectedPort: string,
  opts: { markerRole?: string } = {},
): Promise<void> {
  const markerRole = opts.markerRole ?? TEST_STACK_MARKER_ROLE;
  const parsed = new URL(url);
  if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
    throw new Error(`refusing: host ${parsed.hostname} is not loopback, not a throwaway test stack`);
  }
  if (parsed.port !== expectedPort) {
    throw new Error(`refusing: port ${parsed.port || "(default)"} is not the expected ${expectedPort}`);
  }
  const sql = postgres(url, { max: 1, connect_timeout: 5 });
  try {
    const rows = await sql`select 1 as ok from pg_roles where rolname = ${markerRole}`;
    if (rows.length === 0) {
      throw new Error(`refusing: role ${markerRole} is missing, not a throwaway test stack`);
    }
  } finally {
    await sql.end();
  }
}
