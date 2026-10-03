// Shared helpers for the integration/visual specs that spawn their own real Next.js
// servers (dev or `next start`). Two failure modes this file exists to prevent, both
// observed live during Plan 14 close-out on a 10-core machine running the suite's
// default ~5 parallel workers:
//
// 1. Premature readiness. `next dev` binds its port BEFORE it finishes preparing
//    routes; requests landing in that window get a bare `404 Not Found` from a server
//    with no app mounted yet (observed verbatim: `.next/prerender-manifest.json`
//    ENOENT in the dev log while the port answered). A probe that accepts any status
//    < 500 — or any connection success at all — therefore returns "ready" against a
//    not-yet-serving process, and the first real request of the test races route
//    preparation: 404s, 500s, and boot timeouts that move between specs run to run.
//    `waitForNextServer` only accepts < 400, i.e. a response the actual app produced.
//
// 2. Orphaned servers. Spawning `pnpm exec next …` detached makes the group leader a
//    pnpm wrapper whose own exit leaves `next` (and under `next dev`, the OpenNext
//    platform layer's workerd chain) running with no handle left to kill it. A full
//    suite run left a `next dev` alive through subsequent runs, stealing CPU and
//    skewing every timing-sensitive assertion downstream. `NEXT_BIN` spawns the real
//    `next` binary directly, so the detached group leader IS the server process and
//    the existing `process.kill(-pid)` teardown reaps the whole tree.

import { execFileSync } from "node:child_process";
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// tests/<dir>/<file>.spec.ts -> tests -> apps/web. Resolved once per spec via
// NEXT_BIN; WEB_ROOT is re-exported for the specs' own cwd/env plumbing.
export const WEB_ROOT = join(__dirname, "..", "..");

/** Absolute path to the workspace-pinned `next` binary — never a pnpm/npx wrapper. */
// e2e-linux-3: with VAMOS_DEV_LOG_DIR set (the Linux e2e workflow) the same binary runs through a wrapper that
// keeps the dev server's output; see next-dev-logged.sh.
export const NEXT_BIN = process.env.VAMOS_DEV_LOG_DIR
  ? join(WEB_ROOT, "tests", "support", "next-dev-logged.sh")
  : join(WEB_ROOT, "node_modules", ".bin", "next");

/**
 * Poll `url` until the app itself answers (< 400), not merely a bound socket.
 * Connection-refused windows and premature-404 windows are both "not ready yet".
 */
/**
 * `next dev` binds and answers before `initOpenNextCloudflareForDev()` (fire-and-forget in
 * next.config.ts) has finished. A route that calls `getCloudflareContext()` in that window
 * throws, and the dev server then keeps answering 500 for every such route. Call this right
 * after spawning a dev server whose pages/APIs use bindings, BEFORE the first request.
 * VAMOS_DEV_SETTLE_MS overrides the 15 s default.
 */
export async function settleCloudflareDev(): Promise<void> {
  const ms = Number(process.env.VAMOS_DEV_SETTLE_MS ?? 15_000);
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForNextServer(url: string, timeoutMs = 90_000): Promise<void> {
  const start = Date.now();
  let lastError: unknown = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 400) return;
      lastError = new Error(`status ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Dev server at ${url} did not become ready within ${timeoutMs}ms: ${String(lastError)}`);
}

/**
 * Run a command with its stdout/stderr captured to a temp file so a failing build
 * inside a test setup is diagnosable instead of dying as "Command failed" with
 * `stdio: "ignore"`.
 */
export function execFileLogged(
  cmd: string,
  args: string[],
  opts: { cwd: string; env?: NodeJS.ProcessEnv; timeoutMs?: number },
): void {
  const dir = mkdtempSync(join(tmpdir(), "vt-test-"));
  const logPath = join(dir, "log.txt");
  // `stdio` takes file descriptors, never paths — passing the path string silently
  // fails the overload and, before this was typed correctly, lost the log entirely.
  const logFd = openSync(logPath, "a");
  try {
    execFileSync(cmd, args, {
      cwd: opts.cwd,
      stdio: ["ignore", logFd, logFd],
      env: opts.env,
      timeout: opts.timeoutMs,
    });
  } catch {
    const tail = (() => {
      try {
        return readFileSync(logPath, "utf8").slice(-2000);
      } catch {
        return "(no log)";
      }
    })();
    throw new Error(`${cmd} ${args.join(" ")} failed. Log tail:\n${tail}`);
  } finally {
    closeSync(logFd);
    rmSync(dir, { recursive: true, force: true });
  }
}
