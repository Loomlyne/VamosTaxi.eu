// apps/web/tests/unit/ops-support-read-only.test.ts
//
// Phase 20 F2 (owner decision 2026-09-30): dashboard Support is read-only. No PDF viewer
// (CVE-2024-4367), no file opened in the dashboard, no reply sent from it; the admin
// answers from his own e-mail.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const ticket = readFileSync(join(repoRoot, "app/ops/OpsSupportTicket.dc.html"), "utf8");

describe("dashboard support is read-only @security F2", () => {
  it("loads no PDF viewer", () => {
    expect(ticket).not.toMatch(/pdfjs|pdf\.min\.js|getDocument\(/i);
    expect(existsSync(join(repoRoot, "assets/pdfjs"))).toBe(false);
  });

  it("opens no attachment in the dashboard: file names only", () => {
    expect(ticket).not.toMatch(/\/files\//);
    expect(ticket).not.toMatch(/openPreview|previewOpen|createObjectURL/);
    expect(ticket).toContain('data-file-name="1"');
  });

  it("sends no reply from the dashboard; the answer button is a mailto link", () => {
    expect(ticket).not.toMatch(/\{\s*reply:/);
    expect(ticket).not.toMatch(/sendReply|Textarea/);
    expect(ticket).toMatch(/icon="mail" href="\{\{ mailHref \}\}"[^>]*>\{\{ tAnswer \}\}/);
    expect(ticket).toContain("mailHref: open ? ('mailto:' + open.email) : ''");
  });

  it("the ticket file route only ever downloads, sandboxed and nosniff", () => {
    const route = readFileSync(
      join(repoRoot, "apps/web/app/[locale]/(ops)/api/staff/tickets/[id]/files/[fileId]/route.ts"),
      "utf8",
    );
    expect(route).not.toMatch(/"inline"/);
    expect(route).toContain('return `attachment; filename="${safe}"`;');
    expect(route).toContain('"X-Content-Type-Options": "nosniff"');
    expect(route).toContain(`"Content-Security-Policy": "sandbox; default-src 'none'"`);
  });

  it("has the new strings in en, de, fr and ar", () => {
    expect((ticket.match(/answer:'/g) ?? []).length).toBe(4);
    expect((ticket.match(/mailHint:'/g) ?? []).length).toBe(4);
  });
});
