#!/usr/bin/env node
/**
 * Grok code review for a pull request (owner decision 2026-10-19: Grok replaces the Cursor, Codex and
 * CodeRabbit apps). Runs in .github/workflows/grok-review.yml.
 *
 * Reads the PR diff (GitHub API), sends it to xAI's chat completions endpoint with a fixed reviewer
 * prompt, and posts one review comment on the PR. The comment is replaced on every run (one marker
 * comment per PR), never stacked. Nothing here approves, merges or changes code.
 *
 * Env: XAI_API_KEY (secret; missing = the review is skipped with a workflow warning, never a red check),
 * XAI_MODEL (repo variable, default grok-4), XAI_API_BASE (default https://api.x.ai/v1), GITHUB_TOKEN,
 * GITHUB_REPOSITORY (owner/repo), PR_NUMBER, GITHUB_API_BASE (tests only).
 * `--dry-run` prints the comment instead of posting it.
 */
export const MARKER = "<!-- grok-review -->";
export const MAX_DIFF_CHARS = 120_000;
export const DEFAULT_MODEL = "grok-4";

export const SYSTEM_PROMPT = [
  "You review pull requests for Vamos Taxi, a Swiss airport-transfer booking site (Next.js on Cloudflare Workers,",
  "Supabase, Stripe). Report only real defects you can point to in the diff: bugs, security issues, data leaks,",
  "broken contracts, missing tests for changed behaviour. Rank by severity. Quote the file and line. Be brief:",
  "a bullet per finding, no praise, no summary of the change. If the diff is sound, answer exactly: No findings.",
].join(" ");

/** Cuts a diff to the size the model gets, noting what was dropped. */
export function trimDiff(diff, max = MAX_DIFF_CHARS) {
  if (diff.length <= max) return { text: diff, truncated: false };
  return { text: `${diff.slice(0, max)}\n\n[diff truncated: ${diff.length - max} more characters]`, truncated: true };
}

/** The comment body: marker first so a later run finds and replaces it. */
export function commentBody({ model, sha, findings, truncated }) {
  const note = truncated ? "\n\n_The diff was truncated before review; large files may be unreviewed._" : "";
  return `${MARKER}\n### Grok review (${model}, \`${sha.slice(0, 7)}\`)\n\n${findings.trim()}${note}\n\n---\n_Automated review by Grok via .github/workflows/grok-review.yml_`;
}

export async function reviewWithGrok({ diff, model, apiKey, apiBase, fetchFn = fetch }) {
  const res = await fetchFn(`${apiBase}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Review this pull request diff:\n\n\`\`\`diff\n${diff}\n\`\`\`` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`xAI answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || text.trim() === "") throw new Error("xAI answered without text");
  return text;
}

const GITHUB_API_BASE = (process.env.GITHUB_API_BASE || "https://api.github.com").replace(/\/$/, "");

async function gh(path, token, init = {}) {
  const res = await fetch(`${GITHUB_API_BASE}${path}`, {
    ...init,
    headers: {
      accept: init.accept ?? "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub ${init.method ?? "GET"} ${path} answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res;
}

export async function upsertComment({ repo, prNumber, token, body }) {
  const list = await (await gh(`/repos/${repo}/issues/${prNumber}/comments?per_page=100`, token)).json();
  const mine = list.find((c) => typeof c.body === "string" && c.body.startsWith(MARKER));
  if (mine) {
    await gh(`/repos/${repo}/issues/comments/${mine.id}`, token, { method: "PATCH", body: JSON.stringify({ body }) });
    return "updated";
  }
  await gh(`/repos/${repo}/issues/${prNumber}/comments`, token, { method: "POST", body: JSON.stringify({ body }) });
  return "created";
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const { XAI_API_KEY, GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER, PR_HEAD_SHA } = process.env;
  const model = process.env.XAI_MODEL || DEFAULT_MODEL;
  const apiBase = (process.env.XAI_API_BASE || "https://api.x.ai/v1").replace(/\/$/, "");
  if (!XAI_API_KEY) {
    console.log("::warning::XAI_API_KEY is not set: Grok review skipped. Add the repository secret to turn it on.");
    return;
  }
  for (const [k, v] of Object.entries({ GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER })) {
    if (!v) throw new Error(`grok-review: ${k} is not set`);
  }
  const rawDiff = await (await gh(`/repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}`, GITHUB_TOKEN, { accept: "application/vnd.github.v3.diff" })).text();
  const { text: diff, truncated } = trimDiff(rawDiff);
  const findings = await reviewWithGrok({ diff, model, apiKey: XAI_API_KEY, apiBase });
  const body = commentBody({ model, sha: PR_HEAD_SHA || "unknown", findings, truncated });
  if (dryRun) {
    console.log(body);
    return;
  }
  const outcome = await upsertComment({ repo: GITHUB_REPOSITORY, prNumber: PR_NUMBER, token: GITHUB_TOKEN, body });
  console.log(`grok-review: comment ${outcome} on #${PR_NUMBER} (${model}, diff ${rawDiff.length} chars${truncated ? ", truncated" : ""})`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
