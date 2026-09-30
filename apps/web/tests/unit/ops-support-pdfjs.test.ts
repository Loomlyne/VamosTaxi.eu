// apps/web/tests/unit/ops-support-pdfjs.test.ts
//
// Phase 20 F2: the dashboard support-ticket PDF preview must not run pdf.js with eval
// (CVE-2024-4367) and must load it from our own host with an integrity pin, never unpkg.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const ticket = readFileSync(join(repoRoot, "app/ops/OpsSupportTicket.dc.html"), "utf8");
const vendored = join(repoRoot, "assets/pdfjs/3.11.174");

describe("support ticket PDF preview @security F2", () => {
  it("never loads pdf.js from unpkg", () => {
    expect(ticket).not.toMatch(/unpkg\.com\/pdfjs-dist/);
    expect(ticket).toContain("'/assets/pdfjs/3.11.174/pdf.min.js'");
    expect(ticket).toContain("'/assets/pdfjs/3.11.174/pdf.worker.min.js'");
  });

  it("opens every PDF with isEvalSupported false", () => {
    const calls = ticket.match(/getDocument\([^)]*\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call).toContain("isEvalSupported: false");
  });

  it("pins the vendored script by sha384", () => {
    const pinned = /s\.integrity = '(sha384-[A-Za-z0-9+/=]+)'/.exec(ticket)?.[1];
    const actual =
      "sha384-" + createHash("sha384").update(readFileSync(join(vendored, "pdf.min.js"))).digest("base64");
    expect(pinned).toBe(actual);
  });
});
