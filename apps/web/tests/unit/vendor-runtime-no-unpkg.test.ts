import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SECURITY_HEADER_PAIRS } from "../../lib/security/headers";

const ROOT = join(__dirname, "../../../..");
const COPIES = ["app/support.js", "app/home/support.js", "app/pages/support.js", "app/ops/support.js"];
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const VENDOR: Array<[string, string, string]> = [
  ["REACT_URL", "REACT_SRI", "assets/vendor/react-18.3.1.production.min.js"],
  ["REACT_DOM_URL", "REACT_DOM_SRI", "assets/vendor/react-dom-18.3.1.production.min.js"],
  ["BABEL_URL", "BABEL_SRI", "assets/vendor/babel-standalone-7.29.0.min.js"],
];

describe("F13: React, ReactDOM and Babel come from our own host", () => {
  it("no unpkg.com in any support.js copy", () => {
    for (const f of COPIES) expect(read(f), f).not.toMatch(/unpkg\.com/);
  });

  it("the four support.js copies are identical", () => {
    const [first, ...rest] = COPIES.map(read);
    for (const other of rest) expect(other === first).toBe(true);
  });

  it("the CSP has no unpkg.com", () => {
    const csp = SECURITY_HEADER_PAIRS.find(([k]) => k === "Content-Security-Policy")?.[1] ?? "";
    expect(csp).toContain("script-src");
    expect(csp).not.toMatch(/unpkg\.com/);
  });

  for (const [urlName, sriName, file] of VENDOR) {
    it(`${file} matches ${sriName} and is served from /assets/vendor`, () => {
      const src = read("app/support.js");
      const url = new RegExp(`var ${urlName} = "([^"]+)"`).exec(src)?.[1];
      const sri = new RegExp(`var ${sriName} = "sha384-([^"]+)"`).exec(src)?.[1];
      expect(url).toBe(`/${file}`);
      const digest = createHash("sha384").update(readFileSync(join(ROOT, file))).digest("base64");
      expect(digest).toBe(sri);
    });
  }
});
