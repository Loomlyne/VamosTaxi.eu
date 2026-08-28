// apps/web/lib/version.test.ts
//
// ENGINE_VERSION is a build-time pin. These cases feed resolveEngineVersion
// with injected SHAs — no git, no network.

import { describe, expect, it } from "vitest";
import { ENGINE_VERSION, resolveEngineVersion } from "./version";

const SHA_FORM = /^quote-engine@[0-9a-f]{7,40}$/;
const DEV_FORM = /^quote-engine@dev-/;

describe("resolveEngineVersion", () => {
  it("matches quote-engine@<sha> when CF_PAGES_COMMIT_SHA is a git SHA", () => {
    expect(
      resolveEngineVersion({ cfPagesCommitSha: "abcdef1" }),
    ).toBe("quote-engine@abcdef1");
    expect(resolveEngineVersion({ cfPagesCommitSha: "abcdef1" })).toMatch(
      SHA_FORM,
    );
  });

  it("accepts a full 40-character SHA", () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    expect(resolveEngineVersion({ cfPagesCommitSha: sha })).toBe(
      `quote-engine@${sha}`,
    );
    expect(resolveEngineVersion({ cfPagesCommitSha: sha })).toMatch(SHA_FORM);
  });

  it("lowercases an uppercase SHA so the pin is canonical", () => {
    expect(
      resolveEngineVersion({ cfPagesCommitSha: "ABCDEF1" }),
    ).toBe("quote-engine@abcdef1");
  });

  it("uses GITHUB_SHA when CF_PAGES_COMMIT_SHA is absent", () => {
    expect(resolveEngineVersion({ githubSha: "1234567" })).toBe(
      "quote-engine@1234567",
    );
  });

  it("prefers CF_PAGES_COMMIT_SHA over GITHUB_SHA over gitSha", () => {
    expect(
      resolveEngineVersion({
        cfPagesCommitSha: "aaaaaaa",
        githubSha: "bbbbbbb",
        gitSha: "ccccccc",
      }),
    ).toBe("quote-engine@aaaaaaa");
    expect(
      resolveEngineVersion({
        githubSha: "bbbbbbb",
        gitSha: "ccccccc",
      }),
    ).toBe("quote-engine@bbbbbbb");
    expect(resolveEngineVersion({ gitSha: "ccccccc" })).toBe(
      "quote-engine@ccccccc",
    );
  });

  it("skips a candidate that is not a hex SHA", () => {
    expect(
      resolveEngineVersion({
        cfPagesCommitSha: "not-a-sha",
        githubSha: "abcdef1",
      }),
    ).toBe("quote-engine@abcdef1");
  });

  it("matches quote-engine@dev- only when no SHA is available", () => {
    const dev = resolveEngineVersion({
      buildTimeIso: "2026-08-28T00:00:00.000Z",
    });
    expect(dev).toBe("quote-engine@dev-2026-08-28T00:00:00.000Z");
    expect(dev).toMatch(DEV_FORM);
    expect(dev).not.toMatch(SHA_FORM);
  });

  it("uses the unbuilt stamp when even the iso date is missing", () => {
    const dev = resolveEngineVersion({});
    expect(dev).toBe("quote-engine@dev-unbuilt");
    expect(dev).toMatch(DEV_FORM);
  });
});

describe("ENGINE_VERSION", () => {
  it("is always a quote-engine@ pin, never a bare dev token", () => {
    expect(ENGINE_VERSION.startsWith("quote-engine@")).toBe(true);
    expect(ENGINE_VERSION === "dev" || ENGINE_VERSION === "quote-engine@dev").toBe(
      false,
    );
    expect(SHA_FORM.test(ENGINE_VERSION) || DEV_FORM.test(ENGINE_VERSION)).toBe(
      true,
    );
  });
});
