// apps/web/lib/public/reviews.local.test.ts
//
// Phase 32 plan 08 (W1): the public review list read through the REAL public client (role
// vamos_public, the Worker's publicSql options: `fetch_types: false`, prepared statements). The mocked
// route test cannot see grants; this one proves the `language` column grant and EXECUTE on
// `public.review_ref` reach vamos_public (no 42501), the ref is the first 16 hex of sha256(body), and an
// unpublished review never comes back.
//
// Skipped unless VAMOS_LOCAL_DB_PORT names a DISPOSABLE local stack (the test lab). Fixture rows are
// committed with a random tag and removed in afterAll. Host is fixed to 127.0.0.1.
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { workerSql } from "../../../../packages/db/test/support/worker-client";
import { loadPublishedReviews } from "./reviews";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"];
const tag = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
const env = {
  HYPERDRIVE: { connectionString: `postgres://vamos_public:vamos_public@127.0.0.1:${PORT}/postgres` },
} as unknown as CloudflareEnv;

/** First 16 hex of sha256(body), computed independently of the database. */
function expectedRef(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex").slice(0, 16);
}

describe.skipIf(!PORT)("public review list through the real vamos_public client (local, committed rows)", () => {
  let owner!: ReturnType<typeof workerSql>;
  const bodies = {
    de: `Pünktlich und freundlich, danke. p32-08 ${tag} de`,
    unknown: `On time and friendly. p32-08 ${tag} unknown`,
    hidden: `Not published. p32-08 ${tag} hidden`,
  };
  const ids: string[] = [];

  beforeAll(async () => {
    owner = workerSql(`postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`);
    const rows = await owner<{ id: string }[]>`
      insert into public.reviews (source, author_name, author_role, body, rating, published, sort_order, language)
      values
        ('manual', ${`P32 ${tag} A`}, 'Guest', ${bodies.de}, 5, true, 9001, 'de'),
        ('manual', ${`P32 ${tag} B`}, 'Guest', ${bodies.unknown}, 5, true, 9002, null),
        ('manual', ${`P32 ${tag} C`}, 'Guest', ${bodies.hidden}, 5, false, 9003, 'en')
      returning id`;
    ids.push(...rows.map((r) => r.id));
  });

  afterAll(async () => {
    if (owner && ids.length > 0) {
      await owner`delete from public.reviews where id in ${owner(ids)}`;
    }
    await owner?.end({ timeout: 5 });
  });

  it("returns ref (16 hex = sha256(body)) and language, no 42501, no unpublished row, no row id", async () => {
    const list = await loadPublishedReviews(env);
    const mine = list.filter((r) => r.body.includes(`p32-08 ${tag}`));

    expect(mine.map((r) => r.body).sort()).toEqual([bodies.de, bodies.unknown].sort());

    const de = mine.find((r) => r.body === bodies.de)!;
    const unknown = mine.find((r) => r.body === bodies.unknown)!;
    expect(de.ref).toMatch(/^[0-9a-f]{16}$/);
    expect(de.ref).toBe(expectedRef(bodies.de));
    expect(de.language).toBe("de");
    expect(unknown.ref).toBe(expectedRef(bodies.unknown));
    expect(unknown.language).toBeNull();

    const json = JSON.stringify(mine);
    for (const id of ids) expect(json).not.toContain(id);
    expect(json).not.toMatch(/"id"/);
    expect(list.some((r) => r.body === bodies.hidden)).toBe(false);
  });
});
