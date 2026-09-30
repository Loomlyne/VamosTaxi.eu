import { describe, expect, it } from "vitest";

const MAX_BYTES = 5 * 1024 * 1024;
const D10 = (filename: string) => `Attachment not kept: ${filename}`;

type ClassifyInput = {
  filename: string;
  contentType: string;
  size: number;
  contentDisposition?: string;
};

type ClassifyResult = {
  keep: boolean;
  threadLine: string | null;
};

async function loadClassify(): Promise<{
  classifyInboundFile: (file: ClassifyInput, keptSoFar?: number) => ClassifyResult;
}> {
  // Module lands in 14-05. Static specifier so Vite resolves next to this file.
  return import("./ticket-inbound-files") as Promise<{
    classifyInboundFile: (file: ClassifyInput, keptSoFar?: number) => ClassifyResult;
  }>;
}

describe("INB-02 D-08 D-10 Wave 0 file caps (RED until 14-05)", () => {
  it("keeps image/jpeg size 100", async () => {
    const { classifyInboundFile } = await loadClassify();
    const result = classifyInboundFile(
      { filename: "gate.jpg", contentType: "image/jpeg", size: 100 },
      0,
    );
    expect(result.keep).toBe(true);
    expect(result.threadLine).toBeNull();
  });

  it("rejects application/zip as not-kept with D-10 line", async () => {
    const { classifyInboundFile } = await loadClassify();
    const result = classifyInboundFile(
      { filename: "archive.zip", contentType: "application/zip", size: 100 },
      0,
    );
    expect(result.keep).toBe(false);
    expect(result.threadLine).toBe(D10("archive.zip"));
  });

  it("rejects size 5 MiB + 1 (5242881)", async () => {
    const { classifyInboundFile } = await loadClassify();
    expect(MAX_BYTES).toBe(5242880);
    const result = classifyInboundFile(
      { filename: "huge.jpg", contentType: "image/jpeg", size: 5242880 + 1 },
      0,
    );
    expect(result.keep).toBe(false);
    expect(result.threadLine).toBe(D10("huge.jpg"));
  });

  it("fourth file after three kept is not-kept", async () => {
    const { classifyInboundFile } = await loadClassify();
    const result = classifyInboundFile(
      { filename: "fourth.png", contentType: "image/png", size: 100 },
      3,
    );
    expect(result.keep).toBe(false);
    expect(result.threadLine).toBe(D10("fourth.png"));
  });

  it("inline image/png 100 bytes content_disposition inline skip without D-10 line", async () => {
    const { classifyInboundFile } = await loadClassify();
    const result = classifyInboundFile(
      {
        filename: "sig.png",
        contentType: "image/png",
        size: 100,
        contentDisposition: "inline",
      },
      0,
    );
    expect(result.keep).toBe(false);
    expect(result.threadLine).toBeNull();
  });
});

describe("G15 downloadCapped reads the stream with a cap", () => {
  it("stops reading an undeclared-length body once it passes 5 MiB and reports not kept", async () => {
    const { storeInboundFiles } = (await import("./ticket-inbound-files")) as unknown as {
      storeInboundFiles: (
        env: { SUPPORT_FILES?: unknown },
        attachments: unknown,
        args: { sql: unknown; submissionId: string; messageId: string; bodyText: string },
      ) => Promise<string>;
    };
    const chunk = new Uint8Array(1024 * 1024);
    let pulled = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        if (pulled > 50) {
          controller.close();
          return;
        }
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(stream, { status: 200 })) as typeof fetch;
    const puts: unknown[] = [];
    try {
      const out = await storeInboundFiles(
        { SUPPORT_FILES: { put: async (...a: unknown[]) => void puts.push(a) } },
        [{ filename: "a.jpg", contentType: "image/jpeg", size: 100, downloadUrl: "https://x.test/a.jpg" }],
        {
          sql: (() => {
            throw new Error("sql must not run");
          }) as unknown,
          submissionId: "s",
          messageId: "m",
          bodyText: "hi",
        },
      );
      expect(out).toContain(D10("a.jpg"));
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(puts).toHaveLength(0);
    expect(cancelled).toBe(true);
    expect(pulled).toBeLessThan(15);
  });
});
