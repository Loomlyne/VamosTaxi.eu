// The dashboard host is Worker vamos-dashboard, a gateway that sends dotted files to the
// apex. robots.txt must be answered there, closed, before that rule runs.

import { describe, expect, it } from "vitest";
import gateway from "../../dashboard-gateway";

const apex = { fetch: async () => new Response("public robots") } as unknown as Fetcher;
const env = { APP: apex, PUBLIC: apex };

describe("dashboard robots.txt", () => {
  it("disallows everything and is noindex", async () => {
    const res = await gateway.fetch(new Request("https://dashboard.vamostaxi.site/robots.txt"), env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("User-agent: *\nDisallow: /\n");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("leaves other dotted files on the apex path", async () => {
    const res = await gateway.fetch(new Request("https://dashboard.vamostaxi.site/favicon.ico"), env);
    expect(await res.text()).toBe("public robots");
  });
});
