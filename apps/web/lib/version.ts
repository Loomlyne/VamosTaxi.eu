// apps/web/lib/version.ts
//
// ENGINE_VERSION is READ at request time and computed at build time via
// next.config.ts's `env` block. Nothing may recompute it per request —
// a value that changes mid-request is not a version. The lock pins this
// string and Phase 7 compares it (`engine_changed`).

export type EngineVersionInput = {
  cfPagesCommitSha?: string;
  githubSha?: string;
  gitSha?: string;
  /**
   * ISO timestamp used only when no SHA resolves. Injected at build time
   * so request-time code never authors a clock value.
   */
  buildTimeIso?: string;
};

const SHA_RE = /^[0-9a-f]{7,40}$/i;

function firstSha(candidates: Array<string | undefined>): string | null {
  for (const raw of candidates) {
    if (typeof raw !== "string") continue;
    const sha = raw.trim();
    if (SHA_RE.test(sha)) return sha.toLowerCase();
  }
  return null;
}

/**
 * Resolve `quote-engine@<sha>` from CF_PAGES_COMMIT_SHA, GITHUB_SHA, then a
 * `git rev-parse --short HEAD` fallback, in that order.
 *
 * When none resolves, use `quote-engine@dev-<iso date>`. The `dev-` prefix
 * is what makes an unversioned deploy visible in a lock payload rather than
 * indistinguishable from a real one — a deployed artifact can never silently
 * carry a bare `dev`.
 */
export function resolveEngineVersion(input: EngineVersionInput = {}): string {
  const sha = firstSha([
    input.cfPagesCommitSha,
    input.githubSha,
    input.gitSha,
  ]);
  if (sha) return `quote-engine@${sha}`;
  const stamp =
    input.buildTimeIso && input.buildTimeIso.length > 0
      ? input.buildTimeIso
      : "unbuilt";
  return `quote-engine@dev-${stamp}`;
}

/**
 * Build-time pin. `next.config.ts` writes `QUOTE_ENGINE_VERSION`; this
 * module only reads it. Fallback resolution from SHA env vars is for
 * unit tests that do not evaluate next.config.
 */
export const ENGINE_VERSION: string =
  process.env.QUOTE_ENGINE_VERSION &&
  process.env.QUOTE_ENGINE_VERSION.length > 0
    ? process.env.QUOTE_ENGINE_VERSION
    : resolveEngineVersion({
        cfPagesCommitSha: process.env.CF_PAGES_COMMIT_SHA,
        githubSha: process.env.GITHUB_SHA,
      });
