// apps/web/app/[locale]/(ops)/api/staff/tickets/[id]/files/[fileId]/route.ts
//
// GET /api/staff/tickets/:id/files/:fileId — stream a kept inbound file from SUPPORT_FILES.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asStaff } from "@/lib/db/identity";
import { jsonErr, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

function pathIds(request: Request): { ticketId: string; fileId: string } | null {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const fileId = parts.at(-1) ?? "";
  const ticketId = parts.at(-3) ?? "";
  if (!ticketId || !fileId || ticketId === "files") return null;
  return { ticketId, fileId };
}

function contentDisposition(contentType: string, filename: string): string {
  const safe = filename.replace(/["\\\r\n]/g, "_");
  const type = contentType.toLowerCase();
  const kind = type.startsWith("image/") || type === "application/pdf" ? "inline" : "attachment";
  return `${kind}; filename="${safe}"`;
}

export const GET = withStaff(async (claims, request) => {
  const ids = pathIds(request);
  if (!ids) return jsonErr("not-found", 404);
  const { env } = getCloudflareContext();
  const bucket = env.SUPPORT_FILES;
  if (!bucket) return jsonErr("not-found", 404);

  type FileRow = {
    id: string;
    filename: string;
    content_type: string;
    r2_key: string | null;
    kept: boolean;
  };

  let row: FileRow | undefined;
  try {
    row = await asStaff(env, claims, async (sql) => {
      const rows = await sql<FileRow[]>`
        select f.id, f.filename, f.content_type, f.r2_key, f.kept
        from public.support_message_files f
        inner join public.support_messages m on m.id = f.message_id
        where f.id = ${ids.fileId}::uuid
          and m.submission_id = ${ids.ticketId}::uuid
        limit 1
      `;
      return rows[0];
    });
  } catch {
    return jsonErr("not-found", 404);
  }

  if (!row || !row.kept || !row.r2_key) return jsonErr("not-found", 404);
  const object = await bucket.get(row.r2_key);
  if (!object) return jsonErr("not-found", 404);

  return new Response(object.body, {
    headers: {
      "Content-Type": row.content_type,
      "Content-Disposition": contentDisposition(row.content_type, row.filename),
      "Cache-Control": "private, no-store",
    },
  });
});
