// scripts/i18n-ts-hook.mjs
//
// Phase 32 (plan 09): lets plain Node (type stripping) load the translator engine from a script.
// The engine files import their siblings without an extension ("./guard", "../logger"); Node's ESM
// resolver wants "./guard.ts". This synchronous resolve hook maps an extensionless relative specifier
// to "<path>.ts" when that file exists. Packages resolve normally.

import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";

/** Registers the hook once for this process. */
export function register() {
  // The engine files are .ts in a package without "type": "module"; Node reparses them as ESM and warns
  // once per file. The warning is expected here and only noise in the filler's output.
  const emit = process.emitWarning;
  process.emitWarning = (warning, ...rest) => {
    const code = (warning && warning.code) || (rest[0] && rest[0].code) || rest[1];
    if (code === "MODULE_TYPELESS_PACKAGE_JSON") return;
    return emit.call(process, warning, ...rest);
  };
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (
        (specifier.startsWith("./") || specifier.startsWith("../")) &&
        extname(specifier) === "" &&
        context.parentURL?.startsWith("file:")
      ) {
        const url = new URL(`${specifier}.ts`, context.parentURL);
        if (existsSync(fileURLToPath(url))) return nextResolve(url.href, context);
      }
      return nextResolve(specifier, context);
    },
  });
}
