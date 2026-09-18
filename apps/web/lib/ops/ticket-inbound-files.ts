// apps/web/lib/ops/ticket-inbound-files.ts
//
// Inbound attachment caps + R2 SUPPORT_FILES put. Never PHOTOS. Never staff Send.

import { clipInboundBody } from "./ticket-mail";

export const MAX_INBOUND_FILE_BYTES = 5 * 1024 * 1024;
const MAX_KEPT = 3;
const INLINE_SKIP_BYTES = 20 * 1024;
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

export type ClassifyInboundFileInput = {
  filename: string;
  contentType: string;
  size: number;
  contentDisposition?: string;
};

export type ClassifyInboundFileResult = {
  keep: boolean;
  threadLine: string | null;
};

type SqlTag = {
  (strings: TemplateStringsArray, ...values: unknown[]): unknown;
};

function d10(filename: string): string {
  return `Attachment not kept: ${filename}`;
}

function asFilename(raw: unknown): string {
  const name = String(raw ?? "").trim();
  return name.length > 0 ? name.slice(0, 255) : "attachment";
}

export function classifyInboundFile(
  file: ClassifyInboundFileInput,
  keptSoFar = 0,
): ClassifyInboundFileResult {
  const filename = asFilename(file.filename);
  const disposition = String(file.contentDisposition ?? "").toLowerCase();
  const size = Number(file.size);
  if (disposition.includes("inline") && size < INLINE_SKIP_BYTES) {
    return { keep: false, threadLine: null };
  }
  if (keptSoFar >= MAX_KEPT) {
    return { keep: false, threadLine: d10(filename) };
  }
  if (!ALLOWED.has(file.contentType) || !Number.isFinite(size) || size < 0 || size > MAX_INBOUND_FILE_BYTES) {
    return { keep: false, threadLine: d10(filename) };
  }
  return { keep: true, threadLine: null };
}

function attachmentList(raw: unknown): Array<ClassifyInboundFileInput & { downloadUrl?: string }> {
  if (!Array.isArray(raw)) return [];
  const out: (ClassifyInboundFileInput & { downloadUrl?: string })[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const contentType = typeof rec.contentType === "string"
      ? rec.contentType
      : typeof rec.content_type === "string"
        ? rec.content_type
        : "";
    const size = typeof rec.size === "number"
      ? rec.size
      : typeof rec.byte_size === "number"
        ? rec.byte_size
        : 0;
    const download = typeof rec.download_url === "string"
      ? rec.download_url
      : typeof rec.downloadUrl === "string"
        ? rec.downloadUrl
        : "";
    out.push({
      filename: asFilename(rec.filename),
      contentType,
      size,
      contentDisposition:
        typeof rec.contentDisposition === "string"
          ? rec.contentDisposition
          : typeof rec.content_disposition === "string"
            ? rec.content_disposition
            : undefined,
      downloadUrl: download || undefined,
    });
  }
  return out;
}

async function downloadCapped(url: string): Promise<ArrayBuffer | null> {
  if (!/^https:\/\//i.test(url)) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_INBOUND_FILE_BYTES) return null;
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_INBOUND_FILE_BYTES) return null;
  return buf;
}

export async function storeInboundFiles(
  env: { SUPPORT_FILES?: R2Bucket },
  attachments: unknown,
  args: {
    sql: SqlTag;
    submissionId: string;
    messageId: string;
    bodyText: string;
  },
): Promise<string> {
  const files = attachmentList(attachments);
  if (files.length === 0) return args.bodyText;

  const bucket = env.SUPPORT_FILES;
  let kept = 0;
  const extra: string[] = [];

  for (const file of files) {
    const classified = classifyInboundFile(file, kept);
    if (!classified.keep) {
      if (classified.threadLine) extra.push(classified.threadLine);
      continue;
    }
    if (!bucket) {
      extra.push(d10(file.filename));
      continue;
    }
    const url = file.downloadUrl;
    const bytes = url ? await downloadCapped(url) : null;
    if (!bytes) {
      extra.push(d10(file.filename));
      continue;
    }
    const fileId = crypto.randomUUID();
    const r2Key = `support/${args.submissionId}/${args.messageId}/${fileId}`;
    await bucket.put(r2Key, bytes, {
      httpMetadata: { contentType: file.contentType },
    });
    await args.sql`
      insert into public.support_message_files (
        id, message_id, filename, content_type, byte_size, r2_key, kept
      ) values (
        ${fileId}::uuid,
        ${args.messageId}::uuid,
        ${file.filename},
        ${file.contentType},
        ${bytes.byteLength},
        ${r2Key},
        true
      )
    `;
    kept += 1;
  }

  if (extra.length === 0) return args.bodyText;
  return clipInboundBody(`${args.bodyText}\n${extra.join("\n")}`);
}
