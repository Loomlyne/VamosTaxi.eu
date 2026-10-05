#!/usr/bin/env node
/**
 * `pnpm --filter web run deploy -- --env staging`: the guard in front of the Worker deploy.
 *
 * Why this exists: apps/web/wrangler.jsonc declares the live Worker `vamos` only under
 * `env.staging`. The top-level config (`vamos-web`) carries no bindings on purpose, so a deploy
 * without `--env` creates a stray, empty Worker next to the live one (it happened on 2026-10-01).
 * The old `deploy` script ran the build and the upload with whatever flags it was given, so a bare
 * `pnpm run deploy` did exactly that.
 *
 * Rule: the target must be named. `--env staging` is the only deployable environment today;
 * `production` (vamos-web-production), `front` and `ops-changes` are placeholders or leftovers
 * that wrangler.jsonc says never to deploy. The check runs before the build, so a refused run
 * costs nothing.
 *
 * The cutover to vamostaxi.eu adds `production` to DEPLOYABLE_ENVS here, in the same change that
 * fills its placeholder ids.
 */
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEPLOYABLE_ENVS = ["staging"];

const USAGE = "pnpm --filter web run deploy -- --env staging";

/**
 * Reads the wrangler environment out of a deploy command line.
 * @param {string[]} argv Arguments after the script name (a bare `--` is ignored).
 * @returns {{ ok: true, env: string, args: string[] } | { ok: false, reason: string }}
 */
export function parseDeployArgs(argv) {
  const args = argv.filter((a, i) => !(a === "--" && i === 0));
  let env = null;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--env" || a === "-e") {
      if (env !== null) return { ok: false, reason: "--env is given twice." };
      env = args[i + 1] ?? "";
      i += 1;
    } else if (a.startsWith("--env=")) {
      if (env !== null) return { ok: false, reason: "--env is given twice." };
      env = a.slice("--env=".length);
    }
  }
  if (env === null || env === "" || env.startsWith("-")) {
    return {
      ok: false,
      reason:
        "No environment named. A deploy without --env uploads the empty top-level Worker `vamos-web` " +
        `next to the live one. Run: ${USAGE}`,
    };
  }
  if (!DEPLOYABLE_ENVS.includes(env)) {
    return {
      ok: false,
      reason:
        `Environment "${env}" is not deployable (allowed: ${DEPLOYABLE_ENVS.join(", ")}). ` +
        "production, front and ops-changes are placeholders or leftovers; see apps/web/wrangler.jsonc.",
    };
  }
  return { ok: true, env, args };
}

/**
 * The upload command, byte for byte what `opennextjs-cloudflare deploy -- --env staging` was when the
 * old script string had the arguments appended. The `--` is deliberate: it is the form every deploy of
 * Worker `vamos` has used. `deploy --env staging` without it also fills opennextjs's own `env` option
 * (platform proxy, cache population), which has never been run against this Worker, so it is not
 * switched here without a deploy to prove it.
 * @param {string[]} args The validated arguments from parseDeployArgs.
 * @returns {string[]}
 */
export function openNextDeployArgs(args) {
  return ["deploy", "--", ...args];
}

function run(cmd, cmdArgs) {
  const r = spawnSync(cmd, cmdArgs, { stdio: "inherit" });
  if (r.error) {
    console.error(`deploy: could not start ${cmd}: ${r.error.message}`);
    process.exit(1);
  }
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function main() {
  const parsed = parseDeployArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`deploy: refused. ${parsed.reason}`);
    process.exit(2);
  }
  const here = dirname(fileURLToPath(import.meta.url));
  run(process.execPath, [resolve(here, "sync-dc-mock-to-public.mjs")]);
  run("opennextjs-cloudflare", ["build"]);
  run("opennextjs-cloudflare", openNextDeployArgs(parsed.args));
}

/**
 * True when this file is the entry point. Node leaves `process.argv[1]` as the path it was started with (a symlink
 * stays a symlink) but `import.meta.url` is the real path, so a plain comparison made a symlinked start exit 0 and do
 * nothing. Both sides go through realpathSync; if a path cannot be resolved the plain comparison is the fallback.
 */
export function isEntryPoint(argv1 = process.argv[1], moduleUrl = import.meta.url) {
  if (!argv1) return false;
  const self = fileURLToPath(moduleUrl);
  try {
    return realpathSync(argv1) === realpathSync(self);
  } catch {
    return resolve(argv1) === self;
  }
}

if (isEntryPoint()) {
  main();
}
