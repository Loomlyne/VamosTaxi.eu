// eslint.config.mjs
//
// Plan 03-06 / D-08 / D-10: the compile-time half of DATA-06's two import fences plus the
// `return tx` syntax fence — the runtime SQLSTATE `42501` is the safety net, this file is the
// gate. Deliberately minimal — exactly two ESLint rules (`no-restricted-imports`,
// `no-restricted-syntax`), none of ESLint core's own bundled-defaults preset, none of
// typescript-eslint's bundled rule-set presets (type-checked or not), and no style plugin.
// This repo carries roughly a hundred TypeScript files that have never been linted; pulling
// in a bundled preset here would bury Phase 3's two security rules under hundreds of
// unrelated findings on day one and make this gate unmergeable. A later author who wants a
// broader ruleset adds it deliberately, in its own plan, not as a side effect of this one.
//
// No type-aware linting (`parserOptions.project` left unset) — it would need a full
// TypeScript program per workspace package for two rules that need no type information at
// all; the parser below is used purely to make ESLint able to walk TS/TSX syntax.

import tseslint from "typescript-eslint";

const RETURN_TX_MESSAGE =
  "D-08/ISOL-07: `fn` must return data, never the transaction handle. The conditional return " +
  "type on withIdentity's `fn` parameter already forbids this at compile time — this rule " +
  "closes the `any`-cast route around that type, because a syntax check does not care what a " +
  "call site casts `fn`'s type to.";

const POSTGRES_IMPORT_MESSAGE =
  "D-10: `postgres` is importable only from packages/db/src/identity.ts, " +
  "packages/db/src/public.ts and the staging probe (apps/isolation-probe). Import the named " +
  "wrapper instead — a forgotten wrapper gets SQLSTATE 42501 at runtime and nothing else, " +
  "but this compile-time fence is the real gate, not the review that could have caught it.";

// `paths` entries for the `postgres` ban, reused by every block below. Uses
// `@typescript-eslint/no-restricted-imports` rather than core `no-restricted-imports` for its
// `allowTypeImports` option — core ESLint's rule has no concept of TypeScript's `import type`
// and would flag `apps/web/lib/db/identity.ts`'s own `import type postgres from "postgres"`
// (its `fn` parameter's `postgres.TransactionSql` annotation, added as a deviation in plan
// 03-03) even though that file never constructs a raw client. D-10's real target is a VALUE
// import that could build a client bypassing the wrapper; a type-only reference for a
// signature is not that, anywhere in the repo.
const POSTGRES_PATHS = [{ name: "postgres", message: POSTGRES_IMPORT_MESSAGE, allowTypeImports: true }];

const VAMOS_DB_IMPORT_MESSAGE =
  "D-08: apps/web may import the five named wrappers only — asAnon/asCustomer/asStaff/" +
  "asGuest/asQuote from apps/web/lib/db/identity.ts, publicSql from apps/web/lib/db/public.ts. " +
  "A route or lib file that reaches for @vamos/db directly skips those two files' WAE " +
  "instrumentation and request-time env plumbing, and is a build-time violation here, not a " +
  "style preference to fix later.";

export default [
  // Global ignores — an ignores-only config object applies repo-wide, matching
  // check-next-public-allowlist.mjs's own EXCLUDED_DIRS list plus the two directories this
  // repo's own conventions never lint: `design-system/` (vendored bundle) and `app/` (the
  // legacy `.dc.html` design mocks, not TypeScript at all).
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/.open-next/**",
      "**/dist/**",
      "**/.wrangler/**",
      "**/test-results/**",
      "design-system/**",
      "app/**",
    ],
  },

  // Rule 3 (D-08/ISOL-07) — `no-restricted-syntax`: a `ReturnStatement` whose argument is the
  // bare identifier `tx`, and an arrow function whose body is the bare identifier `tx`
  // (implicit return). Applies everywhere TS/TSX is linted — there is no legitimate reason for
  // any file, including a test, to return a transaction handle from a callback.
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tseslint.parser,
    },
    // Registered here (universal `**/*.ts`/`**/*.tsx`, no `ignores`) so every
    // `@typescript-eslint/*` name is a KNOWN rule repo-wide, even where this config enables
    // none of that plugin's rules. Several files (e.g. `mock-harness.ts`,
    // `identity-contract.test.ts`) already carry `// eslint-disable-next-line
    // @typescript-eslint/<rule>` comments written before this repo had any ESLint config at
    // all (03-PATTERNS.md's own `find … -iname "eslint*"` confirmed none existed) — without
    // this registration ESLint cannot resolve those rule names and reports a hard
    // "Definition for rule … was not found" error; with it, an inactive rule's disable
    // comment is merely an unused-directive warning, which does not fail `pnpm lint`.
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ReturnStatement[argument.type='Identifier'][argument.name='tx']",
          message: RETURN_TX_MESSAGE,
        },
        {
          selector: "ArrowFunctionExpression[body.type='Identifier'][body.name='tx']",
          message: RETURN_TX_MESSAGE,
        },
      ],
    },
  },

  // Rule 1 (D-10) — `no-restricted-imports`: ban the `postgres` specifier everywhere TS/TSX is
  // linted, EXCEPT the two packages/db core modules, the staging probe, and
  // packages/db/test/** — the local isolation simulator legitimately constructs raw
  // postgres.js clients to drive the shipped `withIdentity` through a pinned connection (D-16);
  // banning that would make this repo's own DATA-06 proof unwritable. This block excludes
  // apps/web/app/** and apps/web/lib/** entirely: those two directories get the combined
  // postgres+@vamos/db ban below in one rule invocation, because ESLint flat config replaces
  // (does not merge) a rule's options when the same rule name is set by two different matching
  // config objects — registering `no-restricted-imports` twice for the same file would silently
  // drop whichever ban was registered first.
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: [
      "packages/db/src/identity.ts",
      "packages/db/src/public.ts",
      "apps/isolation-probe/**",
      "packages/db/test/**",
      "apps/web/app/**",
      "apps/web/lib/**",
    ],
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/no-restricted-imports": ["error", { paths: POSTGRES_PATHS }],
    },
  },

  // Rule 1 + Rule 2 combined (D-10 + D-08), apps/web zone. `apps/web/app/**` and
  // `apps/web/lib/**` never import raw `postgres` (same D-10 ban as everywhere else) and may
  // only import `@vamos/db`/`@vamos/db/*` from the two named wrapper files (D-08) — excluded
  // below by name, never by loosening the pattern.
  {
    files: [
      "apps/web/app/**/*.ts",
      "apps/web/app/**/*.tsx",
      "apps/web/lib/**/*.ts",
      "apps/web/lib/**/*.tsx",
    ],
    ignores: ["apps/web/lib/db/identity.ts", "apps/web/lib/db/public.ts"],
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: POSTGRES_PATHS,
          patterns: [
            {
              group: ["@vamos/db", "@vamos/db/*"],
              message: VAMOS_DB_IMPORT_MESSAGE,
            },
          ],
        },
      ],
    },
  },

  // The two named wrapper files themselves: still banned from importing raw `postgres` as a
  // VALUE (they only ever import from `@vamos/db/identity` / `@vamos/db/public`, plus one
  // type-only `postgres` reference for a parameter annotation), but exempt from the
  // `@vamos/db` pattern ban above — importing `@vamos/db/identity` and `@vamos/db/public` is
  // their entire job.
  {
    files: ["apps/web/lib/db/identity.ts", "apps/web/lib/db/public.ts"],
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/no-restricted-imports": ["error", { paths: POSTGRES_PATHS }],
    },
  },
];
