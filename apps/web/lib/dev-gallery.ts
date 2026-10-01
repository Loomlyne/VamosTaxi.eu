/**
 * Test-only switch for the `/dev/*` states gallery (26.0 D-02).
 *
 * True only when NODE_ENV is not "production" AND VAMOS_DEV_GALLERY is "1". Next inlines
 * `process.env.NODE_ENV` at build time, so a production build can never return true.
 * Never put VAMOS_DEV_GALLERY in wrangler.jsonc: component specs set it only in the env of
 * their own spawned `next dev`. worker.ts keeps answering 404 for /dev regardless.
 */
export function devGalleryEnabled(
  env: { NODE_ENV?: string; VAMOS_DEV_GALLERY?: string } = {
    NODE_ENV: process.env.NODE_ENV,
    VAMOS_DEV_GALLERY: process.env.VAMOS_DEV_GALLERY,
  },
): boolean {
  return env.NODE_ENV !== "production" && env.VAMOS_DEV_GALLERY === "1";
}

/** True for `/dev` and `/dev/…` (path already stripped of its locale prefix). */
export function isDevGalleryPath(path: string): boolean {
  return path === "/dev" || path.startsWith("/dev/");
}
