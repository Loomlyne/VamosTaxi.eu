// apps/web/tests/support/dev-log-preload.cjs
//
// e2e-linux-3: specs start `next dev` with stdio "ignore", so when a dev server never becomes ready on a
// GitHub runner there is no trace of why. The Linux e2e workflow sets NODE_OPTIONS=--require=<this file> and
// VAMOS_DEV_LOG_DIR; every Node process whose command line mentions `next` then appends its stdout, stderr,
// uncaught errors and exit code to <dir>/dev-<port>-<pid>.log, and the workflow uploads the folder.
// Does nothing when VAMOS_DEV_LOG_DIR is unset, and nothing in Playwright's own processes.
"use strict";
const dir = process.env.VAMOS_DEV_LOG_DIR;
const cmd = process.argv.join(" ");
if (dir && /next/.test(cmd) && !/playwright/.test(cmd)) {
  const fs = require("node:fs");
  const path = require("node:path");
  const port = (/(?:-p|--port)[ =](\d+)/.exec(cmd) || [])[1] || process.env.PORT || "x";
  try {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `dev-${port}-${process.pid}.log`);
    const append = (text) => {
      try {
        fs.appendFileSync(file, text);
      } catch {
        /* never break the server for a log line */
      }
    };
    append(`# ${new Date().toISOString()} pid ${process.pid} argv ${cmd}\n`);
    for (const stream of [process.stdout, process.stderr]) {
      const write = stream.write.bind(stream);
      stream.write = (chunk, ...rest) => {
        append(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
        return write(chunk, ...rest);
      };
    }
    process.on("uncaughtException", (err) => append(`# uncaughtException ${err && err.stack}\n`));
    process.on("unhandledRejection", (err) => append(`# unhandledRejection ${err && err.stack}\n`));
    process.on("exit", (code) => append(`# ${new Date().toISOString()} exit ${code}\n`));
  } catch {
    /* logging is best effort */
  }
}
