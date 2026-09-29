import { test, expect } from "../support/test";
import { testPort } from "../support/port";
import { spawn, type ChildProcess } from "node:child_process";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";

const SECRET = "v1,whsec_dGVzdHNlY3JldHRlc3RzZWNyZXQ";
const RUN_PROJECT = "component-1440";

let devServer: ChildProcess | null = null;
let baseURL = "";

test.beforeAll(async ({}, testInfo) => {
  if (testInfo.project.name !== RUN_PROJECT) return;
  testInfo.setTimeout(90_000);
  const port = testPort(4180);
  baseURL = `http://localhost:${port}`;
  devServer = spawn(NEXT_BIN, ["dev", "-p", String(port)], {
    cwd: WEB_ROOT,
    stdio: "ignore",
    detached: true,
    env: {
      ...process.env,
      SEND_EMAIL_HOOK_SECRET: SECRET,
    },
  });
  await waitForNextServer(baseURL);
});

test.afterAll(() => {
  if (devServer?.pid) {
    try {
      process.kill(-devServer.pid, "SIGTERM");
    } catch {
      /* gone */
    }
  }
});

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== RUN_PROJECT, "once");
});

test("unsigned hook is 401 @email-hook", async ({ request }) => {
  const res = await request.post(baseURL + "/api/auth/email-hook", {
    data: JSON.stringify({ user: { email: "a@b.co" }, email_data: {} }),
    headers: { "content-type": "application/json" },
  });
  expect(res.status()).toBe(401);
  expect(await res.text()).toBe("");
});
