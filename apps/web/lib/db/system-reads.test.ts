// apps/web/lib/db/system-reads.test.ts
//
// Quick 260929-pga. vamos_system is definer-only: no table access outside the support tables
// (20260827000002 revoke, 20260918120000 grant). A raw table statement inside an asSystem block
// fails with 42501 on live. This guard scans every asSystem(...) block in Worker code and fails on
// a direct table read or write; the answer is a SECURITY DEFINER function (system-reads.ts).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const ROOT = join(__dirname, "..", "..");
// Tables 20260918120000_support_inbound_system_rls.sql grants to vamos_system.
const GRANTED = new Set(["support_inbound_events", "contact_submissions", "support_messages", "support_message_files"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".open-next") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** Text of each `asSystem(` call up to its balanced closing parenthesis. */
function asSystemBlocks(src: string): string[] {
  const blocks: string[] = [];
  let from = 0;
  for (;;) {
    const at = src.indexOf("asSystem(", from);
    if (at < 0) return blocks;
    let depth = 0;
    let i = at + "asSystem".length;
    for (; i < src.length; i += 1) {
      const c = src[i];
      if (c === "(") depth += 1;
      else if (c === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    blocks.push(src.slice(at, i + 1));
    from = i + 1;
  }
}

const TABLE_REF = /\b(?:from|join|into|update|delete\s+from)\s+public\.([a-z_0-9]+)\b(?!\s*\()/gi;

describe("asSystem never touches a table it has no grant on", () => {
  it("no asSystem block reads or writes an ungranted table directly", () => {
    const offenders: string[] = [];
    for (const file of [...walk(join(ROOT, "lib")), ...walk(join(ROOT, "app"))]) {
      if (file.endsWith("lib/db/identity.ts")) continue;
      const src = readFileSync(file, "utf8");
      for (const block of asSystemBlocks(src)) {
        for (const m of block.matchAll(TABLE_REF)) {
          if (!GRANTED.has(m[1]!.toLowerCase())) offenders.push(`${file.slice(ROOT.length + 1)}: ${m[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

const wrappers = vi.hoisted(() => ({
  supersedePendingEditRequest: vi.fn(),
  loadEditPendingPayload: vi.fn(),
}));
vi.mock("@/lib/db/system-reads", () => ({
  ...wrappers,
  loadEditBookingContact: vi.fn(),
  loadEditExtraSession: vi.fn(),
  loadEditSnapshotTotal: vi.fn(),
  loadTripForMail: vi.fn(),
  writeFlightNumber: vi.fn(),
}));

describe("edit-request callers use the definer wrappers", () => {
  it("refuseEditRequest maps the function's row and its empty answer", async () => {
    const { refuseEditRequest } = await import("../ops/edit-request");
    const env = {} as CloudflareEnv;
    const claims = { sub: "11111111-1111-4111-8111-111111111111" } as never;
    wrappers.supersedePendingEditRequest.mockResolvedValueOnce({ booking_id: "b1", request_id: "r1" });
    expect(await refuseEditRequest(env, claims, "VT-1")).toEqual({ ok: true, bookingId: "b1", requestId: "r1" });
    wrappers.supersedePendingEditRequest.mockResolvedValueOnce(null);
    expect(await refuseEditRequest(env, claims, "VT-1")).toEqual({ ok: false, code: "not-found" });
  });

  it("pendingEditHasTimeChange is true only for a non-empty scheduled_local", async () => {
    const { pendingEditHasTimeChange } = await import("../ops/edit-request");
    const env = {} as CloudflareEnv;
    wrappers.loadEditPendingPayload.mockResolvedValueOnce({ scheduled_local: "2031-01-01T10:00" });
    expect(await pendingEditHasTimeChange(env, "VT-1")).toBe(true);
    wrappers.loadEditPendingPayload.mockResolvedValueOnce({ scheduled_local: "  " });
    expect(await pendingEditHasTimeChange(env, "VT-1")).toBe(false);
    wrappers.loadEditPendingPayload.mockResolvedValueOnce(undefined);
    expect(await pendingEditHasTimeChange(env, "VT-1")).toBe(false);
    wrappers.loadEditPendingPayload.mockRejectedValueOnce(new Error("x"));
    expect(await pendingEditHasTimeChange(env, "VT-1")).toBe(false);
  });
});
