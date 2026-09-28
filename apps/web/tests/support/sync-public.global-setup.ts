// apps/web/tests/support/sync-public.global-setup.ts
//
// Several unit suites read the generated public DC copies
// (apps/web/public/app/**) next to their canonical app/** sources. Those
// copies are gitignored build output from scripts/sync-dc-mock-to-public.mjs,
// which only runs as predev/prebuild — so a fresh checkout (CI runs
// test:unit before build) had no copies and the suites failed with ENOENT.
// Run the same sync once before the suites so they see what dev/build serve.

import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export default function setup(): void {
  execFileSync("node", [resolve(here, "../../../../scripts/sync-dc-mock-to-public.mjs")], {
    stdio: "inherit",
  });
}
