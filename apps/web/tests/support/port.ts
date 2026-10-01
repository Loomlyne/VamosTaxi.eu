// One place for every fixed dev-server port a spec binds (26.0-06).
//
// Other sessions on the same Mac run dev servers in 4100-4499. A session sets
// VAMOS_TEST_PORT_OFFSET (e.g. 2000 -> 6100-6499) and every spec moves together;
// scripts/local-test-stack.sh checks the shifted range. Default 0: CI and every
// other session keep the literal ports.
export function testPort(base: number): number {
  const raw = process.env.VAMOS_TEST_PORT_OFFSET;
  const offset = raw === undefined || raw === "" ? 0 : Number(raw);
  if (!Number.isInteger(offset) || offset < 0 || base + offset > 65000) {
    throw new Error(`VAMOS_TEST_PORT_OFFSET must be a non-negative integer, got "${raw}"`);
  }
  return base + offset;
}
