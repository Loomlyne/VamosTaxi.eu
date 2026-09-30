import { existsSync, lstatSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/**
 * Removes everything under `dest` that has no counterpart under `src`, so a file deleted from
 * the repo does not survive in the synced (gitignored) copy under apps/web/public. The copy
 * step never deletes; without this a deleted file keeps shipping, and keeps failing checks that
 * scan the folder. A missing source is an error, never a wipe. A missing destination is fine.
 *
 * @param src  The source folder in the repo.
 * @param dest The synced copy.
 * @returns    Paths removed, relative to `dest` (a removed folder is listed once).
 */
export function pruneMissing(src, dest) {
  if (!existsSync(src)) throw new Error(`sync-prune: missing source ${src}`);
  if (!existsSync(dest)) return [];
  return prune(src, dest, "");
}

function prune(src, dest, rel) {
  const removed = [];
  for (const name of readdirSync(dest)) {
    const d = join(dest, name);
    const s = join(src, name);
    const path = rel ? `${rel}/${name}` : name;
    if (!existsSync(s)) {
      rmSync(d, { recursive: true, force: true });
      removed.push(path);
      continue;
    }
    const dIsDir = lstatSync(d).isDirectory();
    const sIsDir = lstatSync(s).isDirectory();
    if (dIsDir !== sIsDir) {
      rmSync(d, { recursive: true, force: true });
      removed.push(path);
    } else if (dIsDir) {
      removed.push(...prune(s, d, path));
    }
  }
  return removed;
}
