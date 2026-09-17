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
