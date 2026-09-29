// apps/web/lib/checkout/confirmation-page.test.ts
// Source-read: confirmation must not invent pending when Worker env exists.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(
  join(here, "../../app/[locale]/confirmation/[ref]/page.tsx"),
  "utf8",
);

describe("confirmation page catch (K35)", () => {
  it("does not fake pendingTicket when env exists and read throws", () => {
    const catchAt = src.lastIndexOf("} catch {");
    expect(catchAt).toBeGreaterThan(-1);
    const after = src.slice(catchAt);
    expect(after).not.toMatch(/pendingTicket/);
    expect(after).not.toMatch(/initialPhase\s*=\s*["']processing["']/);
  });

  it("local next without env may still show processing", () => {
    expect(src).toMatch(/return getCloudflareContext\(\)\.env;\s*\}\s*catch\s*\{\s*return null;/);
    expect(src).toMatch(/pendingTicket\(ref\)/);
  });
});
