// apps/web/lib/ops/ticket-inbound-webhook.test.ts
//
// Source-read webhook + staff file GET. Do not import route.ts (native configLoader).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

const WEBHOOK = "apps/web/app/api/webhooks/resend/route.ts";
const STAFF_FILE =
  "apps/web/app/[locale]/(ops)/api/staff/tickets/[id]/files/[fileId]/route.ts";

describe("14-06 inbound webhook + staff file GET (source-read)", () => {
  it("keeps Svix on raw body and always GET receiving + attachments", () => {
    const src = read(WEBHOOK);
    expect(src).toContain("svix-signature");
    expect(src).toContain("Webhook");
    expect(src).toContain("email.received");
    expect(src).toContain("emails/receiving");
    expect(src).toContain("/attachments");
    expect(src).toContain("ingestInboundEmail");
    expect(src).toMatch(/payload\.attachments/);
    expect(src).toContain("RESEND_API_KEY");
    expect(src).not.toContain("PHOTOS");
  });

  it("staff file GET uses withStaff and SUPPORT_FILES, not PHOTOS", () => {
    const src = read(STAFF_FILE);
    expect(src).toContain("withStaff");
    expect(src).toContain("SUPPORT_FILES");
    expect(src).toContain("Content-Disposition");
    expect(src).toContain("inline");
    expect(src).not.toContain("PHOTOS");
    expect(src).not.toContain("staffOriginAllowed");
    expect(src).not.toContain("download_url");
  });

  it("does not import webhook route from this test file", () => {
    const src = read("apps/web/lib/ops/ticket-inbound-webhook.test.ts");
    expect(src).toContain("readFileSync");
    expect(src).not.toMatch(/from\s+["'][^"']*webhooks\/resend\/route/);
  });
});
