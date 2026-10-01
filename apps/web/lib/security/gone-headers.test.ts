import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

describe("/dev 404 sends each security header once", () => {
  it("middleware's gone rewrites leave the security headers to next.config headers()", () => {
    const src = readFileSync(resolve(root, "middleware.ts"), "utf8");
    const rewrites = src.match(/NextResponse\.rewrite\(gone\)/g) ?? [];
    expect(rewrites.length).toBeGreaterThan(0);
    expect(src).not.toMatch(/applyStagingNoindex\(request, NextResponse\.rewrite\(gone\)\)/);
    expect(src).toMatch(/applyStagingNoindex\(request, NextResponse\.rewrite\(gone\), false\)/);
  });
});
